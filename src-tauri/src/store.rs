use serde_json::json;
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::incoming::region::ChatRegion;

const STORE_FILENAME: &str = "store.json";
const UI_LOCALE_KEY: &str = "ui_locale";
const DEFAULT_UI_LOCALE: &str = "zh-CN";
const DEFAULT_GAME_SCENE: &str = "dota2";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Phrase {
    pub id: i32,
    pub phrase: String,
    pub hotkey: HotkeyConfig,
}

impl Default for Phrase {
    fn default() -> Self {
        Self {
            id: 1,
            phrase: "GG, well played.".to_string(),
            hotkey: HotkeyConfig::new_platform_specific("Digit1"),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct HotkeyConfig {
    pub modifiers: Vec<String>,
    pub key: String,
    pub shortcut: String,
}

impl HotkeyConfig {
    fn new_platform_specific(key: &str) -> Self {
        #[cfg(target_os = "macos")]
        let (modifier, symbol) = ("Meta", "\u{2318}");
        #[cfg(not(target_os = "macos"))]
        let (modifier, symbol) = ("Alt", "Alt");

        Self {
            modifiers: vec![modifier.to_string()],
            key: key.to_string(),
            shortcut: format!("{}+{}", symbol, key.replace("Key", "").replace("Digit", "")),
        }
    }
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self::new_platform_specific("KeyT")
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct OverlayPreferences {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub opacity: f32,
    pub font_size: u32,
    pub show_original: bool,
    pub fade_ms: u32,
    pub max_lines: u32,
    /// When true, the overlay window ignores mouse events so clicks pass
    /// through to the game underneath. The user toggles this from the main
    /// window since once enabled the overlay itself becomes uninteractable.
    pub click_through: bool,
    /// v0.8 — which screen edge the side-edge ticker anchors to.
    /// One of: `"right" | "left" | "top" | "bottom"`. Default `right`.
    #[serde(default = "default_overlay_anchor")]
    pub anchor: String,
    /// v0.8 — how source-text shows in each message.
    /// One of: `"always" | "hover" | "never"`. Default `always`.
    #[serde(default = "default_show_original_mode")]
    pub show_original_mode: String,
    /// v0.8 — colour ally/enemy messages differently when true.
    #[serde(default = "default_true")]
    pub team_color: bool,
}

fn default_overlay_anchor() -> String {
    "right".to_string()
}

fn default_show_original_mode() -> String {
    "always".to_string()
}

impl Default for OverlayPreferences {
    fn default() -> Self {
        Self {
            x: 24,
            y: 24,
            w: 380,
            h: 280,
            opacity: 0.85,
            font_size: 14,
            show_original: true,
            fade_ms: 8000,
            max_lines: 6,
            click_through: false,
            anchor: default_overlay_anchor(),
            show_original_mode: default_show_original_mode(),
            team_color: true,
        }
    }
}

fn default_incoming_toggle_hotkey() -> HotkeyConfig {
    // Lingo's outgoing translator already owns plain `Cmd/Alt + T`. Use the
    // same main key + Shift so the two halves stay mentally paired.
    #[cfg(target_os = "macos")]
    let (modifiers, symbol) = (vec!["Meta".to_string(), "Shift".to_string()], "\u{2318}+\u{21E7}");
    #[cfg(not(target_os = "macos"))]
    let (modifiers, symbol) = (vec!["Alt".to_string(), "Shift".to_string()], "Alt+\u{21E7}");

    HotkeyConfig {
        modifiers,
        key: "KeyT".to_string(),
        shortcut: format!("{}+T", symbol),
    }
}

fn default_incoming_click_through_hotkey() -> HotkeyConfig {
    // ⌘⌥L / Ctrl+Alt+L — "L for Lock to game". Picked because Control+L and
    // Cmd+L are rare in DotA / LoL / Overwatch keybinds and there's no
    // common chat conflict.
    #[cfg(target_os = "macos")]
    let (modifiers, symbol) = (
        vec!["Meta".to_string(), "Alt".to_string()],
        "\u{2318}+\u{2325}",
    );
    #[cfg(not(target_os = "macos"))]
    let (modifiers, symbol) = (
        vec!["Control".to_string(), "Alt".to_string()],
        "Ctrl+Alt",
    );

    HotkeyConfig {
        modifiers,
        key: "KeyL".to_string(),
        shortcut: format!("{}+L", symbol),
    }
}

fn default_capture_rate_hz() -> f32 {
    1.5
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct AppSettings {
    #[serde(default = "default_true")]
    pub app_enabled: bool,
    pub trans_hotkey: HotkeyConfig,
    pub translation_from: String,
    pub translation_to: String,
    pub game_scene: String,
    pub translation_mode: String,
    pub daily_mode: bool,
    pub phrases: Vec<Phrase>,

    // ---- v0.7.0 incoming-chat translation ---------------------------------
    // All fields default-on-missing so existing settings files keep loading.
    #[serde(default)]
    pub incoming_enabled: bool,
    #[serde(default = "default_incoming_toggle_hotkey")]
    pub incoming_toggle_hotkey: HotkeyConfig,
    #[serde(default = "default_incoming_click_through_hotkey")]
    pub incoming_click_through_hotkey: HotkeyConfig,
    #[serde(default)]
    pub incoming_regions: HashMap<String, ChatRegion>,
    #[serde(default)]
    pub incoming_overlay: OverlayPreferences,
    #[serde(default = "default_capture_rate_hz")]
    pub incoming_capture_rate_hz: f32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            app_enabled: true,
            trans_hotkey: HotkeyConfig::default(),
            translation_from: "zh".to_string(),
            translation_to: "en".to_string(),
            game_scene: DEFAULT_GAME_SCENE.to_string(),
            translation_mode: "auto".to_string(),
            daily_mode: false,
            phrases: default_phrases(),
            incoming_enabled: false,
            incoming_toggle_hotkey: default_incoming_toggle_hotkey(),
            incoming_click_through_hotkey: default_incoming_click_through_hotkey(),
            incoming_regions: HashMap::new(),
            incoming_overlay: OverlayPreferences::default(),
            incoming_capture_rate_hz: default_capture_rate_hz(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn normalize_game_scene(scene: &str) -> String {
    let normalized = scene.trim().to_ascii_lowercase();

    match normalized.as_str() {
        "dota2" | "lol" | "wow" | "overwatch" | "other" => normalized,
        "general" | "moba" | "fps" | "mmo" | "" => DEFAULT_GAME_SCENE.to_string(),
        _ => DEFAULT_GAME_SCENE.to_string(),
    }
}

fn normalize_ui_locale(locale: Option<&str>) -> String {
    let raw = locale.unwrap_or_default().trim().to_ascii_lowercase();

    if raw.starts_with("en") {
        return "en-US".to_string();
    }

    if raw.starts_with("ru") {
        return "ru-RU".to_string();
    }

    if raw.starts_with("zh") {
        return "zh-CN".to_string();
    }

    DEFAULT_UI_LOCALE.to_string()
}

fn default_phrases() -> Vec<Phrase> {
    (1..=8)
        .map(|id| {
            let phrase = match id {
                1 => "GG WP",
                2 => "Smoke and go Roshan.",
                3 => "Play around BKB timing.",
                4 => "No buyback on enemy core.",
                5 => "Def high ground first.",
                6 => "Ward triangle and control rune.",
                7 => "Wait cooldowns then fight.",
                8 => "Push side lanes before objective.",
                _ => unreachable!(),
            };

            Phrase {
                id,
                phrase: phrase.to_string(),
                hotkey: HotkeyConfig::new_platform_specific(&format!("Digit{}", id)),
            }
        })
        .collect()
}

fn normalize_settings(settings: &mut AppSettings) {
    if settings.trans_hotkey.key.is_empty() {
        settings.trans_hotkey = HotkeyConfig::default();
    }

    if settings.translation_from.is_empty() {
        settings.translation_from = "zh".to_string();
    }

    if settings.translation_to.is_empty() {
        settings.translation_to = "en".to_string();
    }

    settings.game_scene = normalize_game_scene(&settings.game_scene);

    if settings.translation_mode.is_empty() {
        settings.translation_mode = "auto".to_string();
    }

    if settings.phrases.is_empty() {
        settings.phrases = default_phrases();
    }

    for (idx, phrase) in settings.phrases.iter_mut().enumerate() {
        phrase.id = (idx + 1) as i32;
    }

    if settings.incoming_toggle_hotkey.key.is_empty() {
        settings.incoming_toggle_hotkey = default_incoming_toggle_hotkey();
    }

    if settings.incoming_click_through_hotkey.key.is_empty() {
        settings.incoming_click_through_hotkey = default_incoming_click_through_hotkey();
    }

    if !settings.incoming_capture_rate_hz.is_finite()
        || settings.incoming_capture_rate_hz < 0.5
        || settings.incoming_capture_rate_hz > 4.0
    {
        settings.incoming_capture_rate_hz = default_capture_rate_hz();
    }

    let ov = &mut settings.incoming_overlay;
    ov.opacity = ov.opacity.clamp(0.2, 1.0);
    if !ov.opacity.is_finite() {
        ov.opacity = 0.85;
    }
    ov.font_size = ov.font_size.clamp(10, 28);
    ov.fade_ms = ov.fade_ms.clamp(2_000, 30_000);
    ov.max_lines = ov.max_lines.clamp(1, 20);
    ov.w = ov.w.clamp(220, 1200);
    ov.h = ov.h.clamp(120, 1200);
    if !matches!(ov.anchor.as_str(), "right" | "left" | "top" | "bottom") {
        ov.anchor = default_overlay_anchor();
    }
    if !matches!(ov.show_original_mode.as_str(), "always" | "hover" | "never") {
        ov.show_original_mode = default_show_original_mode();
    }
}

const SETTINGS_BACKUP_KEY: &str = "settings_corrupted_backup";

fn load_settings_from_store(app: &AppHandle) -> Result<(AppSettings, bool), anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;
    let value = store.get("settings");
    let settings = match value.clone() {
        Some(raw) => match serde_json::from_value::<AppSettings>(raw.clone()) {
            Ok(parsed) => parsed,
            Err(err) => {
                eprintln!(
                    "failed to deserialize stored settings, preserving raw under '{}' and falling back to defaults: {}",
                    SETTINGS_BACKUP_KEY, err
                );
                store.set(SETTINGS_BACKUP_KEY, raw);
                let _ = store.save();
                AppSettings::default()
            }
        },
        None => AppSettings::default(),
    };

    Ok((settings, value.is_some()))
}

fn save_settings_to_store(app: &AppHandle, settings: &AppSettings) -> Result<(), anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;
    store.set("settings", json!(settings));
    store.save()?;
    Ok(())
}

fn initialize_ui_locale(app: &AppHandle) -> Result<(), anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;
    let current = store
        .get(UI_LOCALE_KEY)
        .and_then(|value| value.as_str().map(|item| item.to_string()));
    let normalized = normalize_ui_locale(current.as_deref());

    if current.as_deref() != Some(normalized.as_str()) {
        store.set(UI_LOCALE_KEY, json!(normalized));
        store.save()?;
    }

    Ok(())
}

pub fn initialize_settings(app: &AppHandle) -> Result<(), anyhow::Error> {
    let (mut settings, has_existing) = load_settings_from_store(app)?;
    let original = serde_json::to_value(&settings)?;

    normalize_settings(&mut settings);
    let normalized = serde_json::to_value(&settings)?;
    if !has_existing || original != normalized {
        save_settings_to_store(app, &settings)?;
    }

    initialize_ui_locale(app)?;

    Ok(())
}

pub fn get_settings(app: &AppHandle) -> Result<AppSettings, anyhow::Error> {
    let (mut settings, _) = load_settings_from_store(app)?;
    normalize_settings(&mut settings);
    Ok(settings)
}

pub fn update_settings_field<T: serde::Serialize>(
    app: &AppHandle,
    field_updater: impl FnOnce(&mut AppSettings) -> T,
) -> Result<T, anyhow::Error> {
    let (mut settings, _) = load_settings_from_store(app)?;
    normalize_settings(&mut settings);

    let result = field_updater(&mut settings);
    normalize_settings(&mut settings);
    save_settings_to_store(app, &settings)?;

    Ok(result)
}

pub fn get_ui_locale(app: &AppHandle) -> Result<String, anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;
    let current = store
        .get(UI_LOCALE_KEY)
        .and_then(|value| value.as_str().map(|item| item.to_string()));
    Ok(normalize_ui_locale(current.as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_use_dota2_game_scene() {
        assert_eq!(AppSettings::default().game_scene, DEFAULT_GAME_SCENE);
    }

    #[test]
    fn normalize_settings_resets_legacy_game_scene_values_to_dota2() {
        for legacy in ["general", "moba", "fps", "mmo", "", "unknown-scene"] {
            let mut settings = AppSettings {
                game_scene: legacy.to_string(),
                ..AppSettings::default()
            };
            normalize_settings(&mut settings);
            assert_eq!(settings.game_scene, DEFAULT_GAME_SCENE, "legacy={legacy}");
        }
    }

    #[test]
    fn normalize_settings_preserves_new_game_scene_values() {
        for scene in ["dota2", "lol", "wow", "overwatch", "other"] {
            let mut settings = AppSettings {
                game_scene: scene.to_string(),
                ..AppSettings::default()
            };
            normalize_settings(&mut settings);
            assert_eq!(settings.game_scene, scene, "scene={scene}");
        }
    }
}
