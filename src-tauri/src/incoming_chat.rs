use crate::store::{get_settings, get_ui_locale, update_settings_field, AppSettings};
use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::imageops::FilterType;
use image::{ColorType, ImageEncoder, RgbaImage};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{
    Emitter, Manager, PhysicalPosition, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tokio::time::sleep;

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS,
    HBITMAP, HDC, HGDIOBJ, SRCCOPY,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Storage::Xps::PrintWindow;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
};

const OVERLAY_WINDOW_LABEL: &str = "incoming-chat-overlay";
const SELECTION_WINDOW_LABEL: &str = "incoming-chat-selection";
const OVERLAY_EVENT_NAME: &str = "incoming_chat_overlay_update";
const DEFAULT_CAPTURE_INTERVAL_MS: u64 = 250;
const DEFAULT_STABLE_DEBOUNCE_MS: u64 = 360;
const DEFAULT_FRAME_DIFF_THRESHOLD: f64 = 0.012;
const DEFAULT_DEDUPE_WINDOW_MS: u64 = 8_000;
const DEFAULT_OVERLAY_DURATION_MS: u64 = 6_000;
const DEFAULT_GENERIC_CHAT_ROI: RoiRect = RoiRect {
    x: 0.04,
    y: 0.64,
    width: 0.34,
    height: 0.18,
};
const DEFAULT_DOTA2_CHAT_ROI: RoiRect = RoiRect {
    x: 0.294,
    y: 0.612,
    width: 0.422,
    height: 0.168,
};
const VISION_IMAGE_MAX_DIMENSION: u32 = 1_280;
const VISION_PNG_PREFERRED_MAX_BYTES: usize = 160 * 1024;
const VISION_JPEG_QUALITY: u8 = 86;
#[cfg(target_os = "windows")]
const PW_RENDERFULLCONTENT: u32 = 0x00000002;

static MONITOR_STARTED: AtomicBool = AtomicBool::new(false);
static OVERLAY_HIDE_TICKET: AtomicU64 = AtomicU64::new(0);
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static PUBLIC_CONFIG_CACHE: OnceLock<std::sync::Mutex<CachedPublicConfig>> = OnceLock::new();
static SELECTION_CONTEXT: OnceLock<std::sync::Mutex<Option<SelectionContext>>> = OnceLock::new();

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoiRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl RoiRect {
    fn normalized(self) -> Self {
        Self {
            x: self.x.clamp(0.0, 1.0),
            y: self.y.clamp(0.0, 1.0),
            width: self.width.clamp(0.0, 1.0),
            height: self.height.clamp(0.0, 1.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingChatServerConfig {
    pub enabled: bool,
    pub default_mode: String,
    pub capture_interval_ms: u64,
    pub stable_debounce_ms: u64,
    pub frame_diff_threshold: f64,
    pub dedupe_window_ms: u64,
    pub overlay_duration_ms: u64,
    pub games: HashMap<String, IncomingChatGameProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingChatGameProfile {
    pub default_roi: RoiRect,
    pub auto_detect_enabled: bool,
    pub vision_prompt_version: String,
    #[serde(default)]
    pub window_title_keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicVisionLaneSummary {
    pub enabled: bool,
    pub provider: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicClientConfig {
    pub incoming_chat: IncomingChatServerConfig,
    pub vision_lane: Option<PublicVisionLaneSummary>,
    pub config_source: Option<String>,
    pub updated_at: Option<String>,
}

impl Default for PublicClientConfig {
    fn default() -> Self {
        Self {
            incoming_chat: IncomingChatServerConfig {
                enabled: true,
                default_mode: "auto".to_string(),
                capture_interval_ms: DEFAULT_CAPTURE_INTERVAL_MS,
                stable_debounce_ms: DEFAULT_STABLE_DEBOUNCE_MS,
                frame_diff_threshold: DEFAULT_FRAME_DIFF_THRESHOLD,
                dedupe_window_ms: DEFAULT_DEDUPE_WINDOW_MS,
                overlay_duration_ms: DEFAULT_OVERLAY_DURATION_MS,
                games: default_game_profiles(),
            },
            vision_lane: Some(PublicVisionLaneSummary {
                enabled: false,
                provider: None,
                model: None,
            }),
            config_source: Some("fallback:default".to_string()),
            updated_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionChatLine {
    pub speaker: String,
    pub channel: String,
    pub text: String,
    pub is_system: bool,
    pub confidence: f64,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisionChatResponse {
    lines: Vec<VisionChatLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranslateResponse {
    translated_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayMessage {
    id: u64,
    speaker: String,
    channel: String,
    original_text: String,
    translated_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayPayload {
    duration_ms: u64,
    messages: Vec<OverlayMessage>,
}

#[derive(Debug, Clone)]
struct CachedPublicConfig {
    config: PublicClientConfig,
    expires_at_ms: u64,
}

impl Default for CachedPublicConfig {
    fn default() -> Self {
        Self {
            config: PublicClientConfig::default(),
            expires_at_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct ScreenRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Debug, Clone)]
struct CapturedImage {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone)]
struct VisionEncodedImage {
    base64: String,
    mime_type: &'static str,
}

#[derive(Debug, Clone)]
struct VisionUploadPlan {
    primary: VisionEncodedImage,
    fallback: Option<VisionEncodedImage>,
}

#[derive(Debug, Clone)]
struct SelectionContext {
    purpose: SelectionPurpose,
    reference_window: Option<ScreenRect>,
    restore_main_window: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SelectionPurpose {
    TranslateOnce,
    CalibrateRoi,
}

impl SelectionPurpose {
    fn as_query(self) -> &'static str {
        match self {
            Self::TranslateOnce => "translate",
            Self::CalibrateRoi => "calibrate",
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct ForegroundWindowSnapshot {
    #[cfg(target_os = "windows")]
    hwnd: isize,
    rect: ScreenRect,
}

fn shared_http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

fn default_game_profile(
    default_roi: RoiRect,
    auto_detect_enabled: bool,
    vision_prompt_version: &str,
    window_title_keywords: &[&str],
) -> IncomingChatGameProfile {
    IncomingChatGameProfile {
        default_roi,
        auto_detect_enabled,
        vision_prompt_version: vision_prompt_version.to_string(),
        window_title_keywords: window_title_keywords
            .iter()
            .map(|item| item.to_string())
            .collect(),
    }
}

fn default_game_profiles() -> HashMap<String, IncomingChatGameProfile> {
    HashMap::from([
        (
            "dota2".to_string(),
            default_game_profile(DEFAULT_DOTA2_CHAT_ROI, true, "dota2-chat-v1", &["dota 2"]),
        ),
        (
            "lol".to_string(),
            default_game_profile(
                DEFAULT_GENERIC_CHAT_ROI,
                false,
                "lol-chat-v1",
                &["league of legends"],
            ),
        ),
        (
            "wow".to_string(),
            default_game_profile(
                DEFAULT_GENERIC_CHAT_ROI,
                false,
                "wow-chat-v1",
                &["world of warcraft", "wow"],
            ),
        ),
        (
            "overwatch".to_string(),
            default_game_profile(
                DEFAULT_GENERIC_CHAT_ROI,
                false,
                "overwatch-chat-v1",
                &["overwatch"],
            ),
        ),
        (
            "other".to_string(),
            default_game_profile(DEFAULT_GENERIC_CHAT_ROI, false, "generic-chat-v1", &[]),
        ),
    ])
}

fn normalize_game_scene(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "dota2" | "lol" | "wow" | "overwatch" | "other" => value.trim().to_ascii_lowercase(),
        _ => "dota2".to_string(),
    }
}

fn current_game_scene(settings: &AppSettings) -> String {
    normalize_game_scene(&settings.game_scene)
}

fn resolve_game_profile(config: &PublicClientConfig, game_scene: &str) -> IncomingChatGameProfile {
    config
        .incoming_chat
        .games
        .get(game_scene)
        .cloned()
        .or_else(|| config.incoming_chat.games.get("dota2").cloned())
        .or_else(|| default_game_profiles().get(game_scene).cloned())
        .or_else(|| default_game_profiles().get("dota2").cloned())
        .unwrap_or_else(|| {
            default_game_profile(DEFAULT_DOTA2_CHAT_ROI, true, "dota2-chat-v1", &["dota 2"])
        })
}

fn public_config_cache() -> &'static std::sync::Mutex<CachedPublicConfig> {
    PUBLIC_CONFIG_CACHE.get_or_init(|| std::sync::Mutex::new(CachedPublicConfig::default()))
}

fn selection_context() -> &'static std::sync::Mutex<Option<SelectionContext>> {
    SELECTION_CONTEXT.get_or_init(|| std::sync::Mutex::new(None))
}

fn public_client_config_snapshot() -> PublicClientConfig {
    public_config_cache()
        .lock()
        .map(|cache| cache.config.clone())
        .unwrap_or_default()
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn backend_base_url() -> Result<String> {
    let config = crate::ai_translator::public_backend_config();
    let base = config
        .base_url
        .ok_or_else(|| anyhow!("Missing backend base URL"))?;
    Ok(base.trim_end_matches('/').to_string())
}

fn backend_public_key() -> Option<String> {
    crate::ai_translator::public_backend_config().public_key
}

async fn fetch_public_client_config_remote() -> Result<PublicClientConfig> {
    let url = format!("{}/public/client-config", backend_base_url()?);
    let mut request = shared_http_client().get(&url);

    if let Some(api_key) = backend_public_key() {
        request = request
            .header("apikey", api_key.clone())
            .header(AUTHORIZATION, format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .context("Failed to request public client config")?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "Failed to load public client config (HTTP {})",
            response.status().as_u16()
        ));
    }

    response
        .json::<PublicClientConfig>()
        .await
        .context("Invalid public client config payload")
}

async fn load_public_client_config() -> PublicClientConfig {
    let now_ms = now_unix_ms();
    if let Ok(cache) = public_config_cache().lock() {
        if cache.expires_at_ms > now_ms {
            return cache.config.clone();
        }
    }

    match fetch_public_client_config_remote().await {
        Ok(config) => {
            if let Ok(mut cache) = public_config_cache().lock() {
                cache.config = config.clone();
                cache.expires_at_ms = now_ms + 60_000;
            }
            config
        }
        Err(error) => {
            eprintln!("Failed to fetch incoming chat public config: {}", error);
            public_config_cache()
                .lock()
                .map(|cache| cache.config.clone())
                .unwrap_or_default()
        }
    }
}

async fn recognize_chat_lines_once(
    image: &VisionEncodedImage,
    game_scene: &str,
    ui_locale: &str,
) -> Result<Vec<VisionChatLine>> {
    let url = format!("{}/vision/chat-lines", backend_base_url()?);
    let mut request = shared_http_client()
        .post(&url)
        .header(CONTENT_TYPE, "application/json")
        .json(&serde_json::json!({
            "image_base64": image.base64,
            "image_mime_type": image.mime_type,
            "game_scene": game_scene,
            "ui_locale": ui_locale,
        }));

    if let Some(api_key) = backend_public_key() {
        request = request
            .header("apikey", api_key.clone())
            .header(AUTHORIZATION, format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .context("Failed to request vision chat lines")?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!(
            "Vision lane failed (HTTP {}): {}",
            status,
            body.trim()
        ));
    }

    let payload = response
        .json::<VisionChatResponse>()
        .await
        .context("Invalid vision chat payload")?;
    Ok(payload.lines)
}

fn should_retry_vision_with_fallback(error: &anyhow::Error) -> bool {
    let message = error.to_string();
    message.contains("HTTP 504")
        || message.contains("HTTP 503")
        || message.contains("timed out")
        || message.contains("fetch failed")
}

async fn recognize_chat_lines(
    plan: &VisionUploadPlan,
    game_scene: &str,
    ui_locale: &str,
) -> Result<Vec<VisionChatLine>> {
    match recognize_chat_lines_once(&plan.primary, game_scene, ui_locale).await {
        Ok(lines) if !lines.is_empty() || plan.fallback.is_none() => Ok(lines),
        Ok(_) => {
            if let Some(fallback) = &plan.fallback {
                recognize_chat_lines_once(fallback, game_scene, ui_locale).await
            } else {
                Ok(Vec::new())
            }
        }
        Err(error) => {
            if let Some(fallback) = &plan.fallback {
                if should_retry_vision_with_fallback(&error) {
                    return recognize_chat_lines_once(fallback, game_scene, ui_locale).await;
                }
            }
            Err(error)
        }
    }
}

async fn translate_incoming_line(text: &str, settings: &AppSettings) -> Result<String> {
    let target_language = settings.incoming_chat_target_language.trim();
    let translation_to = if target_language.is_empty() {
        settings.translation_from.trim()
    } else {
        target_language
    };
    let url = format!("{}/translate", backend_base_url()?);
    let mut request = shared_http_client()
        .post(&url)
        .header(CONTENT_TYPE, "application/json")
        .json(&serde_json::json!({
            "text": text,
            "translation_from": "auto",
            "translation_to": translation_to,
            "translation_mode": settings.translation_mode,
            "game_scene": settings.game_scene,
            "daily_mode": false,
            "usage": "inbound_read",
        }));

    if let Some(api_key) = backend_public_key() {
        request = request
            .header("apikey", api_key.clone())
            .header(AUTHORIZATION, format!("Bearer {}", api_key));
    }

    let response = request
        .send()
        .await
        .context("Failed to translate incoming chat line")?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!(
            "Incoming translation failed (HTTP {}): {}",
            status,
            body.trim()
        ));
    }

    let payload = response
        .json::<TranslateResponse>()
        .await
        .context("Invalid incoming translation payload")?;
    Ok(payload.translated_text.trim().to_string())
}

fn compute_frame_signature(bytes: &[u8]) -> u64 {
    let mut state = 14_695_981_039_346_656_037_u64;
    let step = usize::max(4, bytes.len() / 256);
    for byte in bytes.iter().step_by(step) {
        state ^= u64::from(*byte);
        state = state.wrapping_mul(1_099_511_628_211);
    }
    state
}

fn frame_diff_ratio(previous: &[u8], current: &[u8]) -> f64 {
    if previous.len() != current.len() || previous.is_empty() {
        return 1.0;
    }

    let mut compared = 0_u64;
    let mut changed = 0_u64;
    let step = usize::max(16, previous.len() / 1024);

    for index in (0..previous.len()).step_by(step) {
        compared += 1;
        if previous[index].abs_diff(current[index]) > 12 {
            changed += 1;
        }
    }

    if compared == 0 {
        return 0.0;
    }

    changed as f64 / compared as f64
}

fn scale_dimensions(width: u32, height: u32, max_dimension: u32) -> (u32, u32) {
    if width == 0 || height == 0 || width.max(height) <= max_dimension {
        return (width.max(1), height.max(1));
    }

    if width >= height {
        let scaled_height = ((height as f64 / width as f64) * max_dimension as f64).round() as u32;
        (max_dimension, scaled_height.max(1))
    } else {
        let scaled_width = ((width as f64 / height as f64) * max_dimension as f64).round() as u32;
        (scaled_width.max(1), max_dimension)
    }
}

fn resize_for_vision(image: &CapturedImage) -> Result<CapturedImage> {
    let (target_width, target_height) =
        scale_dimensions(image.width, image.height, VISION_IMAGE_MAX_DIMENSION);
    if target_width == image.width && target_height == image.height {
        return Ok(image.clone());
    }

    let rgba = RgbaImage::from_raw(image.width, image.height, image.rgba.clone())
        .ok_or_else(|| anyhow!("Failed to create RGBA image buffer for resize"))?;
    let resized = image::imageops::resize(&rgba, target_width, target_height, FilterType::Triangle);
    Ok(CapturedImage {
        rgba: resized.into_raw(),
        width: target_width,
        height: target_height,
    })
}

fn encode_png(image: &CapturedImage) -> Result<Vec<u8>> {
    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(
            &image.rgba,
            image.width,
            image.height,
            ColorType::Rgba8.into(),
        )
        .context("Failed to encode screenshot PNG")?;
    Ok(png)
}

fn encode_jpeg(image: &CapturedImage) -> Result<Vec<u8>> {
    let mut rgb = Vec::with_capacity((image.width * image.height * 3) as usize);
    for pixel in image.rgba.chunks_exact(4) {
        let alpha = u16::from(pixel[3]);
        let red = ((u16::from(pixel[0]) * alpha) / 255) as u8;
        let green = ((u16::from(pixel[1]) * alpha) / 255) as u8;
        let blue = ((u16::from(pixel[2]) * alpha) / 255) as u8;
        rgb.extend_from_slice(&[red, green, blue]);
    }

    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, VISION_JPEG_QUALITY)
        .encode(&rgb, image.width, image.height, ColorType::Rgb8.into())
        .context("Failed to encode screenshot JPEG")?;
    Ok(jpeg)
}

fn encode_vision_image(image: &CapturedImage) -> Result<VisionUploadPlan> {
    let resized = resize_for_vision(image)?;
    let png = encode_png(&resized)?;
    let jpeg = encode_jpeg(&resized)?;
    let png_image = VisionEncodedImage {
        base64: BASE64_STANDARD.encode(png),
        mime_type: "image/png",
    };
    let jpeg_image = VisionEncodedImage {
        base64: BASE64_STANDARD.encode(jpeg),
        mime_type: "image/jpeg",
    };

    if png_image.base64.len() <= (VISION_PNG_PREFERRED_MAX_BYTES * 4 / 3) {
        return Ok(VisionUploadPlan {
            primary: png_image,
            fallback: Some(jpeg_image),
        });
    }

    Ok(VisionUploadPlan {
        primary: jpeg_image,
        fallback: Some(png_image),
    })
}

fn fingerprint_line(line: &VisionChatLine) -> String {
    format!(
        "{}|{}|{}",
        line.speaker.trim().to_lowercase(),
        line.channel.trim().to_lowercase(),
        line.text
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase()
    )
}

fn cleanup_dedupe_entries(dedupe: &mut HashMap<String, u64>, dedupe_window_ms: u64, now_ms: u64) {
    dedupe.retain(|_, seen_at| now_ms.saturating_sub(*seen_at) <= dedupe_window_ms);
}

fn event_message_id() -> u64 {
    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

fn overlay_origin(window_rect: ScreenRect, roi: RoiRect) -> (i32, i32) {
    let roi_px_x = (window_rect.width as f64 * roi.x).round() as i32;
    let roi_px_y = (window_rect.height as f64 * roi.y).round() as i32;
    let roi_px_width = (window_rect.width as f64 * roi.width).round() as i32;
    let x = window_rect.x + roi_px_x;
    let y = window_rect.y + roi_px_y - 132;
    let width = roi_px_width.max(360);
    let adjusted_x = x.clamp(
        window_rect.x,
        window_rect.x + window_rect.width.saturating_sub(width),
    );
    (adjusted_x, y.max(window_rect.y))
}

fn ensure_overlay_window(app: &tauri::AppHandle) -> Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("index.html?mode=incoming-overlay".into()),
    )
    .title("Lingo Incoming Chat Overlay")
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .resizable(false)
    .inner_size(520.0, 180.0)
    .build()
    .context("Failed to create incoming chat overlay window")?;

    let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
    let _ = window.set_ignore_cursor_events(true);
    Ok(window)
}

fn hide_overlay_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn show_overlay_messages(
    app: &tauri::AppHandle,
    anchor_rect: ScreenRect,
    roi: RoiRect,
    duration_ms: u64,
    messages: Vec<OverlayMessage>,
) -> Result<()> {
    if messages.is_empty() {
        return Ok(());
    }

    let window = ensure_overlay_window(app)?;
    let (x, y) = overlay_origin(anchor_rect, roi);
    let _ = window.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
    let _ = window.set_size(Size::Physical(tauri::PhysicalSize::new(520, 180)));
    let _ = window.show();
    let _ = window.emit(
        OVERLAY_EVENT_NAME,
        OverlayPayload {
            duration_ms,
            messages,
        },
    );

    let ticket = OVERLAY_HIDE_TICKET.fetch_add(1, Ordering::Relaxed) + 1;
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(duration_ms)).await;
        if OVERLAY_HIDE_TICKET.load(Ordering::Acquire) == ticket {
            hide_overlay_window(&app_handle);
        }
    });

    Ok(())
}

fn active_roi(settings: &AppSettings, config: &PublicClientConfig, game_scene: &str) -> RoiRect {
    settings
        .incoming_chat_roi_override
        .unwrap_or(resolve_game_profile(config, game_scene).default_roi)
        .normalized()
}

async fn translate_lines_to_overlay(
    settings: &AppSettings,
    lines: Vec<VisionChatLine>,
    dedupe: &mut HashMap<String, u64>,
    dedupe_window_ms: u64,
) -> Vec<OverlayMessage> {
    let now_ms = now_unix_ms();
    cleanup_dedupe_entries(dedupe, dedupe_window_ms, now_ms);

    let mut translated_messages = Vec::new();
    for line in lines {
        if line.is_system || line.text.trim().is_empty() {
            continue;
        }

        let fingerprint = fingerprint_line(&line);
        if dedupe.contains_key(&fingerprint) {
            continue;
        }

        match translate_incoming_line(&line.text, settings).await {
            Ok(translated_text) => {
                dedupe.insert(fingerprint, now_ms);
                translated_messages.push(OverlayMessage {
                    id: event_message_id(),
                    speaker: line.speaker.clone(),
                    channel: line.channel.clone(),
                    original_text: line.text.clone(),
                    translated_text,
                });
            }
            Err(error) => {
                eprintln!("Failed to translate incoming chat line: {}", error);
            }
        }
    }

    translated_messages
}

fn maybe_emit_incoming_error(app: &tauri::AppHandle, error: &str) {
    let _ = app.emit("translation_failed", error.to_string());
}

pub fn start_incoming_chat_monitor(app: &tauri::AppHandle) {
    if MONITOR_STARTED
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut previous_frame: Option<Vec<u8>> = None;
        let mut pending_signature: Option<u64> = None;
        let mut pending_since: Option<Instant> = None;
        let mut last_processed_signature: Option<u64> = None;
        let mut dedupe = HashMap::<String, u64>::new();

        loop {
            let settings = match get_settings(&app_handle) {
                Ok(settings) => settings,
                Err(error) => {
                    eprintln!(
                        "Failed to read settings for incoming chat monitor: {}",
                        error
                    );
                    sleep(Duration::from_millis(DEFAULT_CAPTURE_INTERVAL_MS)).await;
                    continue;
                }
            };

            let public_config = load_public_client_config().await;
            let capture_interval_ms = public_config.incoming_chat.capture_interval_ms.max(120);

            if !settings.app_enabled
                || !settings.incoming_chat_enabled
                || settings.incoming_chat_mode != "auto"
                || !public_config.incoming_chat.enabled
                || !public_config
                    .vision_lane
                    .as_ref()
                    .map(|lane| lane.enabled)
                    .unwrap_or(false)
            {
                previous_frame = None;
                pending_signature = None;
                pending_since = None;
                hide_overlay_window(&app_handle);
                sleep(Duration::from_millis(capture_interval_ms)).await;
                continue;
            }

            #[cfg(not(target_os = "windows"))]
            {
                hide_overlay_window(&app_handle);
                sleep(Duration::from_millis(capture_interval_ms)).await;
                continue;
            }

            #[cfg(target_os = "windows")]
            {
                let game_scene = current_game_scene(&settings);
                let game_profile = resolve_game_profile(&public_config, &game_scene);
                if !game_profile.auto_detect_enabled {
                    previous_frame = None;
                    pending_signature = None;
                    pending_since = None;
                    hide_overlay_window(&app_handle);
                    sleep(Duration::from_millis(capture_interval_ms)).await;
                    continue;
                }

                let Some(active_window) = resolve_auto_capture_window(&app_handle, &game_profile)
                else {
                    previous_frame = None;
                    pending_signature = None;
                    pending_since = None;
                    hide_overlay_window(&app_handle);
                    sleep(Duration::from_millis(capture_interval_ms)).await;
                    continue;
                };

                let roi = active_roi(&settings, &public_config, &game_scene);
                let region = rect_from_roi(active_window.rect, roi);
                let capture = match capture_region_from_snapshot(Some(&active_window), region) {
                    Ok(capture) => capture,
                    Err(error) => {
                        eprintln!("Failed to capture incoming chat region: {}", error);
                        sleep(Duration::from_millis(capture_interval_ms)).await;
                        continue;
                    }
                };

                let signature = compute_frame_signature(&capture.rgba);
                let diff_ratio = previous_frame
                    .as_ref()
                    .map(|previous| frame_diff_ratio(previous, &capture.rgba))
                    .unwrap_or(1.0);
                previous_frame = Some(capture.rgba.clone());

                let threshold = public_config.incoming_chat.frame_diff_threshold;
                if diff_ratio >= threshold && pending_signature != Some(signature) {
                    pending_signature = Some(signature);
                    pending_since = Some(Instant::now());
                    sleep(Duration::from_millis(capture_interval_ms)).await;
                    continue;
                }

                if pending_signature == Some(signature) {
                    let stable_elapsed = pending_since
                        .map(|started| started.elapsed().as_millis() as u64)
                        .unwrap_or_default();
                    if stable_elapsed < public_config.incoming_chat.stable_debounce_ms {
                        sleep(Duration::from_millis(capture_interval_ms)).await;
                        continue;
                    }
                } else if last_processed_signature == Some(signature) {
                    sleep(Duration::from_millis(capture_interval_ms)).await;
                    continue;
                }

                let upload_plan = match encode_vision_image(&capture) {
                    Ok(upload_plan) => upload_plan,
                    Err(error) => {
                        eprintln!("Failed to encode incoming chat screenshot: {}", error);
                        sleep(Duration::from_millis(capture_interval_ms)).await;
                        continue;
                    }
                };
                let ui_locale = get_ui_locale(&app_handle).unwrap_or_else(|_| "zh-CN".to_string());
                let recognized_lines =
                    match recognize_chat_lines(&upload_plan, &game_scene, &ui_locale).await {
                        Ok(lines) => lines,
                        Err(error) => {
                            eprintln!("Failed to recognize incoming chat lines: {}", error);
                            maybe_emit_incoming_error(&app_handle, &error.to_string());
                            sleep(Duration::from_millis(capture_interval_ms)).await;
                            continue;
                        }
                    };

                let translated = translate_lines_to_overlay(
                    &settings,
                    recognized_lines,
                    &mut dedupe,
                    public_config.incoming_chat.dedupe_window_ms,
                )
                .await;

                last_processed_signature = Some(signature);
                pending_signature = None;
                pending_since = None;

                if settings.incoming_chat_overlay_enabled && !translated.is_empty() {
                    let _ = show_overlay_messages(
                        &app_handle,
                        active_window.rect,
                        roi,
                        public_config.incoming_chat.overlay_duration_ms,
                        translated,
                    );
                }

                sleep(Duration::from_millis(capture_interval_ms)).await;
            }
        }
    });
}

pub fn begin_manual_translate_selection(app: &tauri::AppHandle) -> Result<()> {
    open_selection_window(app, SelectionPurpose::TranslateOnce)
}

pub fn begin_roi_calibration(app: &tauri::AppHandle) -> Result<()> {
    open_selection_window(app, SelectionPurpose::CalibrateRoi)
}

pub async fn trigger_incoming_chat_hotkey(app: &tauri::AppHandle) -> Result<()> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        return Err(anyhow!(
            "Incoming chat hotkey is currently only supported on Windows"
        ));
    }

    #[cfg(target_os = "windows")]
    {
        let public_config = load_public_client_config().await;
        if !public_config
            .vision_lane
            .as_ref()
            .map(|lane| lane.enabled)
            .unwrap_or(false)
        {
            return Err(anyhow!(
                "Incoming chat vision lane is disabled on the server"
            ));
        }

        let settings = get_settings(app)?;
        let game_scene = current_game_scene(&settings);
        let game_profile = resolve_game_profile(&public_config, &game_scene);
        let active_window = get_foreground_window_for_scene(&game_profile)
            .or_else(get_foreground_window_snapshot)
            .ok_or_else(|| anyhow!("Active game window is unavailable"))?;
        let roi = active_roi(&settings, &public_config, &game_scene);
        let selection = rect_from_roi(active_window.rect, roi);

        translate_region_to_overlay(
            app,
            &settings,
            &public_config,
            &game_scene,
            Some(active_window),
            active_window.rect,
            roi,
            selection,
        )
        .await
    }
}

pub async fn start_incoming_chat_translate_flow(app: &tauri::AppHandle) -> Result<()> {
    match trigger_incoming_chat_hotkey(app).await {
        Ok(()) => Ok(()),
        Err(error) => {
            if error
                .to_string()
                .contains("Active game window is unavailable")
            {
                begin_manual_translate_selection(app)
            } else {
                Err(error)
            }
        }
    }
}

async fn translate_region_to_overlay(
    app: &tauri::AppHandle,
    settings: &AppSettings,
    public_config: &PublicClientConfig,
    game_scene: &str,
    capture_window: Option<ForegroundWindowSnapshot>,
    anchor_rect: ScreenRect,
    roi: RoiRect,
    selection: ScreenRect,
) -> Result<()> {
    let capture = capture_region_from_snapshot(capture_window.as_ref(), selection)?;
    let upload_plan = encode_vision_image(&capture)?;
    let ui_locale = get_ui_locale(app).unwrap_or_else(|_| "zh-CN".to_string());
    let lines = recognize_chat_lines(&upload_plan, game_scene, &ui_locale).await?;
    let mut dedupe = HashMap::new();
    let translated = translate_lines_to_overlay(
        settings,
        lines,
        &mut dedupe,
        public_config.incoming_chat.dedupe_window_ms,
    )
    .await;

    if settings.incoming_chat_overlay_enabled && !translated.is_empty() {
        show_overlay_messages(
            app,
            anchor_rect,
            roi,
            public_config.incoming_chat.overlay_duration_ms,
            translated,
        )?;
    }

    Ok(())
}

fn open_selection_window(app: &tauri::AppHandle, purpose: SelectionPurpose) -> Result<()> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = purpose;
        return Err(anyhow!(
            "Incoming chat selection is currently only supported on Windows"
        ));
    }

    #[cfg(target_os = "windows")]
    {
        let settings = get_settings(app).unwrap_or_default();
        let game_scene = current_game_scene(&settings);
        let game_profile = resolve_game_profile(&public_client_config_snapshot(), &game_scene);
        let detected_game_window =
            get_foreground_window_for_scene(&game_profile).map(|snapshot| snapshot.rect);
        let active_window = if purpose == SelectionPurpose::CalibrateRoi {
            detected_game_window
        } else {
            detected_game_window
                .or_else(|| get_foreground_window_snapshot().map(|snapshot| snapshot.rect))
        };
        let available_monitors = app
            .available_monitors()
            .context("Failed to enumerate monitors")?;
        let cursor_position = current_cursor_position();
        let target_monitor = available_monitors
            .iter()
            .find(|monitor| {
                active_window
                    .map(|window_rect| monitor_contains_window_center(monitor, window_rect))
                    .unwrap_or(false)
            })
            .cloned()
            .or_else(|| {
                cursor_position.and_then(|(x, y)| {
                    available_monitors
                        .iter()
                        .find(|monitor| monitor_contains_point(monitor, x, y))
                        .cloned()
                })
            })
            .or_else(|| app.primary_monitor().ok().flatten())
            .ok_or_else(|| anyhow!("Primary monitor is unavailable"))?;
        let target_monitor_rect = monitor_screen_rect(&target_monitor);
        let monitor_position = target_monitor.position();
        let monitor_size = target_monitor.size();
        let restore_main_window = purpose == SelectionPurpose::CalibrateRoi;
        let reference_window = if purpose == SelectionPurpose::CalibrateRoi {
            Some(detected_game_window.unwrap_or(target_monitor_rect))
        } else {
            None
        };

        if let Ok(mut context) = selection_context().lock() {
            *context = Some(SelectionContext {
                purpose,
                reference_window,
                restore_main_window,
            });
        }

        if let Some(existing) = app.get_webview_window(SELECTION_WINDOW_LABEL) {
            let _ = existing.close();
        }

        if restore_main_window {
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.minimize();
            }
        }

        let window = WebviewWindowBuilder::new(
            app,
            SELECTION_WINDOW_LABEL,
            WebviewUrl::App(
                format!(
                    "index.html?mode=incoming-selection&purpose={}",
                    purpose.as_query()
                )
                .into(),
            ),
        )
        .title("Lingo Incoming Chat Selection")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(true)
        .resizable(false)
        .position(monitor_position.x as f64, monitor_position.y as f64)
        .inner_size(monitor_size.width as f64, monitor_size.height as f64)
        .build()
        .context("Failed to create incoming chat selection window")?;

        let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
        Ok(())
    }
}

fn monitor_contains_window_center(monitor: &tauri::Monitor, rect: ScreenRect) -> bool {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let center_x = rect.x + rect.width / 2;
    let center_y = rect.y + rect.height / 2;
    let monitor_left = monitor_position.x;
    let monitor_top = monitor_position.y;
    let monitor_right = monitor_left + monitor_size.width as i32;
    let monitor_bottom = monitor_top + monitor_size.height as i32;

    center_x >= monitor_left
        && center_x < monitor_right
        && center_y >= monitor_top
        && center_y < monitor_bottom
}

fn monitor_contains_point(monitor: &tauri::Monitor, x: i32, y: i32) -> bool {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let monitor_left = monitor_position.x;
    let monitor_top = monitor_position.y;
    let monitor_right = monitor_left + monitor_size.width as i32;
    let monitor_bottom = monitor_top + monitor_size.height as i32;

    x >= monitor_left && x < monitor_right && y >= monitor_top && y < monitor_bottom
}

fn monitor_screen_rect(monitor: &tauri::Monitor) -> ScreenRect {
    ScreenRect {
        x: monitor.position().x,
        y: monitor.position().y,
        width: monitor.size().width as i32,
        height: monitor.size().height as i32,
    }
}

#[cfg(target_os = "windows")]
fn current_cursor_position() -> Option<(i32, i32)> {
    let mut point = POINT { x: 0, y: 0 };
    let ok = unsafe { GetCursorPos(&mut point) };
    if ok == 0 {
        return None;
    }

    Some((point.x, point.y))
}

#[cfg(target_os = "windows")]
fn logical_selection_to_screen_rect(
    window: &WebviewWindow,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<ScreenRect> {
    let outer_position = window
        .outer_position()
        .context("Failed to read incoming selection window position")?;
    let scale_factor = window
        .scale_factor()
        .context("Failed to read incoming selection window scale factor")?;

    Ok(ScreenRect {
        x: outer_position.x + (x as f64 * scale_factor).round() as i32,
        y: outer_position.y + (y as f64 * scale_factor).round() as i32,
        width: (width.max(1) as f64 * scale_factor).round().max(1.0) as i32,
        height: (height.max(1) as f64 * scale_factor).round().max(1.0) as i32,
    })
}

#[tauri::command]
pub async fn start_incoming_chat_selection(app_handle: tauri::AppHandle) -> Result<(), String> {
    start_incoming_chat_translate_flow(&app_handle)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn start_incoming_chat_roi_calibration(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    begin_roi_calibration(&app_handle).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn clear_incoming_chat_roi_override(
    app_handle: tauri::AppHandle,
) -> Result<crate::store::AppSettings, String> {
    update_settings_field(&app_handle, |settings| {
        settings.incoming_chat_roi_override = None;
    })
    .map_err(|error| error.to_string())?;

    get_settings(&app_handle).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn submit_incoming_chat_selection(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let selection = logical_selection_to_screen_rect(&window, x, y, width, height)
        .map_err(|error| error.to_string())?;

    #[cfg(not(target_os = "windows"))]
    let selection = ScreenRect {
        x,
        y,
        width,
        height,
    };

    let should_restore = handle_submitted_selection(&app_handle, selection)
        .await
        .map_err(|error| error.to_string())?;
    if should_restore {
        restore_main_window_if_needed(&app_handle);
    }
    let _ = window.close();
    Ok(())
}

#[tauri::command]
pub async fn cancel_incoming_chat_selection(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    let mut should_restore = false;
    if let Ok(mut context) = selection_context().lock() {
        should_restore = context
            .as_ref()
            .map(|value| value.restore_main_window)
            .unwrap_or(false);
        *context = None;
    }
    if should_restore {
        restore_main_window_if_needed(&app_handle);
    }
    let _ = window.close();
    Ok(())
}

fn restore_main_window_if_needed(app: &tauri::AppHandle) {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.unminimize();
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
}

async fn handle_submitted_selection(app: &tauri::AppHandle, selection: ScreenRect) -> Result<bool> {
    if selection.width <= 1 || selection.height <= 1 {
        return Err(anyhow!("Selection is too small"));
    }

    let context = {
        let mut guard = selection_context()
            .lock()
            .map_err(|_| anyhow!("Selection context is unavailable"))?;
        guard.take()
    };
    let Some(context) = context else {
        return Err(anyhow!("Selection context is missing"));
    };
    let should_restore = context.restore_main_window;

    match context.purpose {
        SelectionPurpose::CalibrateRoi => {
            let reference = context.reference_window.ok_or_else(|| {
                anyhow!("Active game window is not available for ROI calibration")
            })?;
            let roi = roi_from_screen_rect(selection, reference);
            update_settings_field(app, move |settings| {
                settings.incoming_chat_roi_override = Some(roi);
            })
            .context("Failed to save calibrated chat ROI")?;
        }
        SelectionPurpose::TranslateOnce => {
            let public_config = load_public_client_config().await;
            if !public_config
                .vision_lane
                .as_ref()
                .map(|lane| lane.enabled)
                .unwrap_or(false)
            {
                return Err(anyhow!(
                    "Incoming chat vision lane is disabled on the server"
                ));
            }
            let settings = get_settings(app)?;
            let game_scene = current_game_scene(&settings);
            translate_region_to_overlay(
                app,
                &settings,
                &public_config,
                &game_scene,
                None,
                selection,
                RoiRect {
                    x: 0.0,
                    y: 0.0,
                    width: 1.0,
                    height: 1.0,
                },
                selection,
            )
            .await?;
        }
    }

    Ok(should_restore)
}

fn roi_from_screen_rect(selection: ScreenRect, reference_window: ScreenRect) -> RoiRect {
    let width = reference_window.width.max(1) as f64;
    let height = reference_window.height.max(1) as f64;
    RoiRect {
        x: (selection.x - reference_window.x) as f64 / width,
        y: (selection.y - reference_window.y) as f64 / height,
        width: selection.width as f64 / width,
        height: selection.height as f64 / height,
    }
    .normalized()
}

#[cfg(target_os = "windows")]
fn rect_from_roi(window_rect: ScreenRect, roi: RoiRect) -> ScreenRect {
    let x = window_rect.x + (window_rect.width as f64 * roi.x).round() as i32;
    let y = window_rect.y + (window_rect.height as f64 * roi.y).round() as i32;
    let width = (window_rect.width as f64 * roi.width).round().max(2.0) as i32;
    let height = (window_rect.height as f64 * roi.height).round().max(2.0) as i32;
    ScreenRect {
        x,
        y,
        width,
        height,
    }
}

#[cfg(target_os = "windows")]
fn title_matches_keywords(title: &str, keywords: &[String]) -> bool {
    if keywords.is_empty() {
        return false;
    }

    let normalized_title = title.to_ascii_lowercase();
    keywords
        .iter()
        .any(|keyword| normalized_title.contains(keyword))
}

#[cfg(target_os = "windows")]
fn resolve_auto_capture_window(
    app: &tauri::AppHandle,
    game_profile: &IncomingChatGameProfile,
) -> Option<ForegroundWindowSnapshot> {
    get_foreground_window_for_scene(game_profile).or_else(|| {
        let snapshot = get_foreground_window_snapshot()?;
        if window_roughly_matches_monitor(app, snapshot.rect) {
            Some(snapshot)
        } else {
            None
        }
    })
}

#[cfg(target_os = "windows")]
fn window_roughly_matches_monitor(app: &tauri::AppHandle, rect: ScreenRect) -> bool {
    let monitors = match app.available_monitors() {
        Ok(monitors) => monitors,
        Err(_) => return false,
    };

    monitors
        .iter()
        .any(|monitor| rect_roughly_matches_monitor(rect, monitor))
}

#[cfg(target_os = "windows")]
fn rect_roughly_matches_monitor(rect: ScreenRect, monitor: &tauri::Monitor) -> bool {
    let monitor_rect = ScreenRect {
        x: monitor.position().x,
        y: monitor.position().y,
        width: monitor.size().width as i32,
        height: monitor.size().height as i32,
    };
    let overlap_area = rect_intersection_area(rect, monitor_rect);
    if overlap_area == 0 {
        return false;
    }

    let monitor_area = monitor_rect.width as i64 * monitor_rect.height as i64;
    let width_delta = (rect.width - monitor_rect.width).abs();
    let height_delta = (rect.height - monitor_rect.height).abs();

    overlap_area * 100 >= monitor_area * 80 && width_delta <= 64 && height_delta <= 64
}

#[cfg(target_os = "windows")]
fn rect_intersection_area(a: ScreenRect, b: ScreenRect) -> i64 {
    let left = a.x.max(b.x);
    let top = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);

    let width = (right - left).max(0) as i64;
    let height = (bottom - top).max(0) as i64;
    width * height
}

#[cfg(target_os = "windows")]
fn get_foreground_window_for_scene(
    game_profile: &IncomingChatGameProfile,
) -> Option<ForegroundWindowSnapshot> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }

    let title = window_title(hwnd)?;
    if !title_matches_keywords(&title, &game_profile.window_title_keywords) {
        return None;
    }

    Some(ForegroundWindowSnapshot {
        hwnd: hwnd as isize,
        rect: window_rect_from_hwnd(hwnd)?,
    })
}

#[cfg(target_os = "windows")]
fn get_foreground_window_snapshot() -> Option<ForegroundWindowSnapshot> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }

    Some(ForegroundWindowSnapshot {
        hwnd: hwnd as isize,
        rect: window_rect_from_hwnd(hwnd)?,
    })
}

#[cfg(target_os = "windows")]
fn window_rect_from_hwnd(hwnd: HWND) -> Option<ScreenRect> {
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let ok = unsafe { GetWindowRect(hwnd, &mut rect) };
    if ok == 0 {
        return None;
    }

    Some(ScreenRect {
        x: rect.left,
        y: rect.top,
        width: (rect.right - rect.left).max(1),
        height: (rect.bottom - rect.top).max(1),
    })
}

#[cfg(target_os = "windows")]
fn window_title(hwnd: HWND) -> Option<String> {
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return None;
    }

    let mut buffer = vec![0_u16; length as usize + 1];
    let written = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if written <= 0 {
        return None;
    }

    String::from_utf16(&buffer[..written as usize]).ok()
}

#[cfg(target_os = "windows")]
fn capture_region_from_snapshot(
    snapshot: Option<&ForegroundWindowSnapshot>,
    region: ScreenRect,
) -> Result<CapturedImage> {
    if let Some(snapshot) = snapshot {
        if rect_contains(snapshot.rect, region) {
            match capture_window_region(snapshot, region) {
                Ok(capture) => return Ok(capture),
                Err(error) => {
                    eprintln!(
                        "PrintWindow capture failed for region {}x{} at ({}, {}): {}",
                        region.width, region.height, region.x, region.y, error
                    );
                }
            }
        }
    }

    capture_screen_region(region)
}

#[cfg(target_os = "windows")]
fn rect_contains(outer: ScreenRect, inner: ScreenRect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height
}

#[cfg(target_os = "windows")]
fn capture_window_region(
    snapshot: &ForegroundWindowSnapshot,
    region: ScreenRect,
) -> Result<CapturedImage> {
    let crop = ScreenRect {
        x: region.x - snapshot.rect.x,
        y: region.y - snapshot.rect.y,
        width: region.width,
        height: region.height,
    };

    if !rect_contains(
        ScreenRect {
            x: 0,
            y: 0,
            width: snapshot.rect.width,
            height: snapshot.rect.height,
        },
        crop,
    ) {
        return Err(anyhow!(
            "Window crop is outside the foreground window bounds"
        ));
    }

    let bitmap = capture_window_bitmap(
        snapshot.hwnd as HWND,
        snapshot.rect.width,
        snapshot.rect.height,
    )?;
    crop_bgra_bitmap(&bitmap, snapshot.rect.width, snapshot.rect.height, crop)
}

#[cfg(target_os = "windows")]
fn capture_window_bitmap(hwnd: HWND, width: i32, height: i32) -> Result<Vec<u8>> {
    if width <= 0 || height <= 0 {
        return Err(anyhow!("Foreground window size is empty"));
    }

    unsafe {
        let screen_dc: HDC = GetDC(std::ptr::null_mut());
        if screen_dc.is_null() {
            return Err(anyhow!(
                "Failed to acquire screen DC for PrintWindow capture"
            ));
        }

        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(anyhow!(
                "Failed to create compatible DC for PrintWindow capture"
            ));
        }

        let bitmap: HBITMAP = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.is_null() {
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(anyhow!(
                "Failed to create compatible bitmap for PrintWindow capture"
            ));
        }

        let previous_object: HGDIOBJ = SelectObject(memory_dc, bitmap as HGDIOBJ);
        let mut rendered = PrintWindow(hwnd, memory_dc, PW_RENDERFULLCONTENT);
        if rendered == 0 {
            rendered = PrintWindow(hwnd, memory_dc, 0);
        }

        if rendered == 0 {
            SelectObject(memory_dc, previous_object);
            DeleteObject(bitmap as _);
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(anyhow!("PrintWindow failed"));
        }

        let buffer_result = read_bitmap_bgra(memory_dc, bitmap, width, height);

        SelectObject(memory_dc, previous_object);
        DeleteObject(bitmap as _);
        DeleteDC(memory_dc);
        ReleaseDC(std::ptr::null_mut(), screen_dc);

        buffer_result
    }
}

#[cfg(target_os = "windows")]
fn capture_screen_region(region: ScreenRect) -> Result<CapturedImage> {
    if region.width <= 0 || region.height <= 0 {
        return Err(anyhow!("Capture region is empty"));
    }

    unsafe {
        let screen_dc: HDC = GetDC(std::ptr::null_mut());
        if screen_dc.is_null() {
            return Err(anyhow!("Failed to acquire screen DC"));
        }

        let memory_dc = CreateCompatibleDC(screen_dc);
        if memory_dc.is_null() {
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(anyhow!("Failed to create compatible DC"));
        }

        let bitmap: HBITMAP = CreateCompatibleBitmap(screen_dc, region.width, region.height);
        if bitmap.is_null() {
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(anyhow!("Failed to create compatible bitmap"));
        }

        let previous_object: HGDIOBJ = SelectObject(memory_dc, bitmap as HGDIOBJ);
        let blit_ok = BitBlt(
            memory_dc,
            0,
            0,
            region.width,
            region.height,
            screen_dc,
            region.x,
            region.y,
            SRCCOPY | CAPTUREBLT,
        );

        if blit_ok == 0 {
            SelectObject(memory_dc, previous_object);
            DeleteObject(bitmap as _);
            DeleteDC(memory_dc);
            ReleaseDC(std::ptr::null_mut(), screen_dc);
            return Err(anyhow!("BitBlt failed"));
        }

        let buffer_result = read_bitmap_bgra(memory_dc, bitmap, region.width, region.height);

        SelectObject(memory_dc, previous_object);
        DeleteObject(bitmap as _);
        DeleteDC(memory_dc);
        ReleaseDC(std::ptr::null_mut(), screen_dc);

        let mut buffer = buffer_result?;
        convert_bgra_to_rgba(&mut buffer);
        Ok(CapturedImage {
            rgba: buffer,
            width: region.width as u32,
            height: region.height as u32,
        })
    }
}

#[cfg(target_os = "windows")]
fn read_bitmap_bgra(memory_dc: HDC, bitmap: HBITMAP, width: i32, height: i32) -> Result<Vec<u8>> {
    let mut bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [Default::default(); 1],
    };

    let mut buffer = vec![0_u8; (width * height * 4) as usize];
    let rows = unsafe {
        GetDIBits(
            memory_dc,
            bitmap,
            0,
            height as u32,
            buffer.as_mut_ptr() as *mut _,
            &mut bitmap_info,
            DIB_RGB_COLORS,
        )
    };

    if rows == 0 {
        return Err(anyhow!("GetDIBits failed"));
    }

    Ok(buffer)
}

#[cfg(target_os = "windows")]
fn crop_bgra_bitmap(
    source: &[u8],
    source_width: i32,
    source_height: i32,
    crop: ScreenRect,
) -> Result<CapturedImage> {
    if crop.x < 0
        || crop.y < 0
        || crop.width <= 0
        || crop.height <= 0
        || crop.x + crop.width > source_width
        || crop.y + crop.height > source_height
    {
        return Err(anyhow!("Bitmap crop is out of bounds"));
    }

    let source_stride = source_width as usize * 4;
    let crop_stride = crop.width as usize * 4;
    let mut rgba = vec![0_u8; crop.height as usize * crop_stride];

    for row in 0..crop.height as usize {
        let source_offset = ((crop.y as usize + row) * source_stride) + crop.x as usize * 4;
        let target_offset = row * crop_stride;
        rgba[target_offset..target_offset + crop_stride]
            .copy_from_slice(&source[source_offset..source_offset + crop_stride]);
    }

    convert_bgra_to_rgba(&mut rgba);
    Ok(CapturedImage {
        rgba,
        width: crop.width as u32,
        height: crop.height as u32,
    })
}

#[cfg(target_os = "windows")]
fn convert_bgra_to_rgba(buffer: &mut [u8]) {
    for pixel in buffer.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_region_from_snapshot(
    _snapshot: Option<&ForegroundWindowSnapshot>,
    region: ScreenRect,
) -> Result<CapturedImage> {
    capture_screen_region(region)
}

#[cfg(not(target_os = "windows"))]
fn capture_screen_region(_region: ScreenRect) -> Result<CapturedImage> {
    Err(anyhow!(
        "Incoming chat capture is only supported on Windows"
    ))
}
