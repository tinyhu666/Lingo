use crate::store::initialize_settings;
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::Serialize;
use serde_json::Value;
use tauri::Manager;

#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{COLORREF, HWND};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
pub mod ai_translator;
pub mod shell_helper;
pub mod shortcut;
pub mod store;
pub mod tray;

const RELEASE_LATEST_JSON_URL: &str =
    "https://lingo-1259551686.cos.ap-shanghai.myqcloud.com/releases/latest.json";
const RELEASE_WEBSITE_LATEST_JSON_URL: &str =
    "https://lingo-1259551686.cos.ap-shanghai.myqcloud.com/releases/latest-web.json";
const RELEASE_GITHUB_LATEST_JSON_URL: &str =
    "https://github.com/tinyhu666/Lingo/releases/latest/download/latest.json";
const RELEASE_FETCH_TIMEOUT_MS: u64 = 4_000;

#[cfg(target_os = "windows")]
const WINDOW_CORNER_RADIUS: i32 = 30;

#[cfg(target_os = "windows")]
fn apply_windows_window_chrome(window: &tauri::WebviewWindow) {
    let Ok(window_handle) = window.window_handle() else {
        return;
    };

    let RawWindowHandle::Win32(raw) = window_handle.as_raw() else {
        return;
    };

    let hwnd = raw.hwnd.get() as HWND;
    let corner_preference = DWMWCP_DONOTROUND;
    let border_color: COLORREF = DWMWA_COLOR_NONE;

    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &corner_preference as *const _ as *const _,
            std::mem::size_of_val(&corner_preference) as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR as u32,
            &border_color as *const _ as *const _,
            std::mem::size_of_val(&border_color) as u32,
        );
    }

    let Ok(size) = window.outer_size() else {
        return;
    };

    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let radius = ((WINDOW_CORNER_RADIUS as f64) * scale_factor)
        .round()
        .max(1.0) as i32;

    let region = unsafe {
        CreateRoundRectRgn(
            0,
            0,
            size.width as i32 + 1,
            size.height as i32 + 1,
            radius,
            radius,
        )
    };

    if !region.is_null() {
        unsafe {
            let _ = SetWindowRgn(hwnd, region, 1);
        }
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseMetadata {
    version: Option<String>,
    manifest_version: Option<String>,
    release_version: Option<String>,
    published_at: Option<String>,
    manifest_published_at: Option<String>,
    release_published_at: Option<String>,
    body: Option<String>,
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let left_parts = left
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect::<Vec<_>>();
    let right_parts = right
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect::<Vec<_>>();
    let max_len = left_parts.len().max(right_parts.len());

    for index in 0..max_len {
        let left_value = *left_parts.get(index).unwrap_or(&0);
        let right_value = *right_parts.get(index).unwrap_or(&0);

        match left_value.cmp(&right_value) {
            std::cmp::Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    std::cmp::Ordering::Equal
}

fn pick_newer_version(left: Option<String>, right: Option<String>) -> Option<String> {
    match (left, right) {
        (Some(left_version), Some(right_version)) => {
            if compare_versions(&left_version, &right_version).is_lt() {
                Some(right_version)
            } else {
                Some(left_version)
            }
        }
        (Some(version), None) | (None, Some(version)) => Some(version),
        (None, None) => None,
    }
}

fn normalize_version(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().trim_start_matches('v').trim().to_string())
        .filter(|item| !item.is_empty())
}

fn value_as_non_empty_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(raw)) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Some(Value::Number(number)) => Some(number.to_string()),
        _ => None,
    }
}

fn pick_release_date(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value_as_non_empty_string(payload.get(*key)))
}

fn extract_from_manifest(payload: &Value) -> ReleaseMetadata {
    ReleaseMetadata {
        version: normalize_version(value_as_non_empty_string(payload.get("version"))),
        manifest_version: normalize_version(value_as_non_empty_string(payload.get("version"))),
        release_version: None,
        published_at: pick_release_date(payload, &["pub_date", "published_at", "created_at"]),
        manifest_published_at: pick_release_date(
            payload,
            &["pub_date", "published_at", "created_at"],
        ),
        release_published_at: None,
        body: value_as_non_empty_string(payload.get("notes")),
    }
}

fn extract_from_release_manifest(payload: &Value) -> ReleaseMetadata {
    ReleaseMetadata {
        version: normalize_version(value_as_non_empty_string(payload.get("version"))),
        manifest_version: None,
        release_version: normalize_version(value_as_non_empty_string(payload.get("version"))),
        published_at: pick_release_date(payload, &["pub_date", "published_at", "created_at"]),
        manifest_published_at: None,
        release_published_at: pick_release_date(
            payload,
            &["pub_date", "published_at", "created_at"],
        ),
        body: value_as_non_empty_string(payload.get("notes")),
    }
}

async fn fetch_release_json(url: &str) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(RELEASE_FETCH_TIMEOUT_MS))
        .build()
        .map_err(|error| format!("failed to build release metadata client: {}", error))?;
    let response = client
        .get(url)
        .header(USER_AGENT, "Lingo-Desktop")
        .header(ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("request failed: {}", error))?;

    if !response.status().is_success() {
        return Err(format!("request failed with status {}", response.status()));
    }

    response
        .json::<Value>()
        .await
        .map_err(|error| format!("invalid json payload: {}", error))
}

#[tauri::command]
fn log_to_backend(message: String) {
    println!("Frontend Log: {}", message);
}

#[tauri::command]
fn get_version(app_handle: tauri::AppHandle) -> String {
    app_handle.package_info().version.to_string()
}

#[tauri::command]
fn get_public_backend_config() -> ai_translator::PublicBackendConfig {
    ai_translator::public_backend_config()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn update_translator_shortcut(
    app_handle: tauri::AppHandle,
    keys: Vec<String>,
) -> Result<store::AppSettings, String> {
    shortcut::update_translator_shortcut(&app_handle, keys)?;
    store::get_settings(&app_handle).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_settings(app_handle: tauri::AppHandle) -> Result<store::AppSettings, String> {
    store::get_settings(&app_handle).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_app_enabled(
    app_handle: tauri::AppHandle,
    enabled: bool,
) -> Result<store::AppSettings, String> {
    store::update_settings_field(&app_handle, |settings| {
        settings.app_enabled = enabled;
    })
    .map_err(|e| e.to_string())?;

    if enabled {
        tauri::async_runtime::spawn(async {
            if let Err(error) = ai_translator::warm_translation_backend().await {
                eprintln!("启用时预热翻译代理失败: {}", error);
            }
        });
    }

    store::get_settings(&app_handle).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_phrases(
    app_handle: tauri::AppHandle,
    phrases: Vec<store::Phrase>,
) -> Result<store::AppSettings, String> {
    shortcut::update_phrases(&app_handle, phrases)?;
    store::get_settings(&app_handle).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_latest_release_metadata() -> Result<ReleaseMetadata, String> {
    let website_manifest_task = tauri::async_runtime::spawn(async {
        fetch_release_json(RELEASE_WEBSITE_LATEST_JSON_URL).await
    });
    let manifest_task =
        tauri::async_runtime::spawn(async { fetch_release_json(RELEASE_LATEST_JSON_URL).await });
    let website_release_manifest = website_manifest_task
        .await
        .ok()
        .and_then(|result| result.ok())
        .map(|payload| extract_from_release_manifest(&payload));

    let manifest = manifest_task
        .await
        .ok()
        .and_then(|result| result.ok())
        .map(|payload| extract_from_manifest(&payload));
    let github_release_manifest = if website_release_manifest.is_none() && manifest.is_none() {
        fetch_release_json(RELEASE_GITHUB_LATEST_JSON_URL)
            .await
            .ok()
            .map(|payload| extract_from_release_manifest(&payload))
    } else {
        None
    };
    let release_manifest = website_release_manifest.or(github_release_manifest);

    if manifest.is_none() && release_manifest.is_none() {
        return Err("failed to load release metadata".to_string());
    }

    let manifest_version = manifest
        .as_ref()
        .and_then(|data| data.manifest_version.clone());
    let release_version = release_manifest
        .as_ref()
        .and_then(|data| data.release_version.clone());
    let version = pick_newer_version(manifest_version.clone(), release_version.clone());
    let should_prefer_release = matches!(
        (&version, &release_version),
        (Some(version), Some(release_version)) if version == release_version
    );

    Ok(ReleaseMetadata {
        version,
        manifest_version,
        release_version,
        published_at: if should_prefer_release {
            release_manifest
                .as_ref()
                .and_then(|data| data.release_published_at.clone())
                .or_else(|| {
                    manifest
                        .as_ref()
                        .and_then(|data| data.manifest_published_at.clone())
                })
        } else {
            manifest
                .as_ref()
                .and_then(|data| data.manifest_published_at.clone())
                .or_else(|| {
                    release_manifest
                        .as_ref()
                        .and_then(|data| data.release_published_at.clone())
                })
        },
        manifest_published_at: manifest
            .as_ref()
            .and_then(|data| data.manifest_published_at.clone()),
        release_published_at: release_manifest
            .as_ref()
            .and_then(|data| data.release_published_at.clone()),
        body: release_manifest
            .as_ref()
            .and_then(|data| data.body.clone())
            .or_else(|| manifest.as_ref().and_then(|data| data.body.clone())),
    })
}

pub fn run() {
    println!("Starting application...");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        // 剪贴板插件
        .plugin(tauri_plugin_clipboard_manager::init())
        // opener插件
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 初始化存储
            println!("Initializing...");
            match initialize_settings(app.app_handle()) {
                Ok(_) => println!("应用设置初始化完成"),
                Err(e) => eprintln!("初始化设置失败: {}", e),
            }

            match store::get_settings(app.app_handle()) {
                Ok(settings) if settings.app_enabled => {
                    tauri::async_runtime::spawn(async {
                        if let Err(error) = ai_translator::warm_translation_backend().await {
                            eprintln!("启动时预热翻译代理失败: {}", error);
                        }
                    });
                }
                Ok(_) => println!("应用当前处于暂停状态，跳过翻译代理预热"),
                Err(error) => eprintln!("读取设置以决定是否预热失败: {}", error),
            }

            // 初始化所有快捷键
            println!("正在注册全局快捷键...");
            match shortcut::init_shortcuts(app.app_handle()) {
                Ok(_) => println!("快捷键设置成功"),
                Err(e) => eprintln!("注册全局快捷键失败: {}", e),
            }

            // 创建AI模型托盘
            match tray::create_tray(app.app_handle()) {
                Ok(_) => println!("托盘创建成功"),
                Err(e) => eprintln!("创建托盘失败: {}", e),
            }

            // 设置 WebView 背景为全透明，消除圆角外的矩形残留
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                #[cfg(target_os = "windows")]
                {
                    let _ = window.set_shadow(false);
                    apply_windows_window_chrome(&window);

                    let window_clone = window.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                        apply_windows_window_chrome(&window_clone);
                    });
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            update_translator_shortcut,
            log_to_backend,
            get_settings,
            get_version,
            get_public_backend_config,
            set_app_enabled,
            update_phrases,
            get_latest_release_metadata
        ]);

    #[cfg(not(target_os = "windows"))]
    let builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if let Err(error) = window.hide() {
                eprintln!("隐藏窗口失败: {}", error);
            }
            #[cfg(target_os = "macos")]
            let _ = window
                .app_handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory);
            api.prevent_close();
        }
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
