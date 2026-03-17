use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILENAME: &str = "store.json";

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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            app_enabled: true,
            trans_hotkey: HotkeyConfig::default(),
            translation_from: "zh".to_string(),
            translation_to: "en".to_string(),
            game_scene: "general".to_string(),
            translation_mode: "auto".to_string(),
            daily_mode: false,
            phrases: default_phrases(),
        }
    }
}

fn default_true() -> bool {
    true
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

    if settings.game_scene.is_empty() {
        settings.game_scene = "general".to_string();
    }

    if settings.translation_mode.is_empty() {
        settings.translation_mode = "auto".to_string();
    }

    if settings.phrases.is_empty() {
        settings.phrases = default_phrases();
    }

    for (idx, phrase) in settings.phrases.iter_mut().enumerate() {
        phrase.id = (idx + 1) as i32;
    }
}

fn load_settings_from_store(app: &AppHandle) -> Result<(AppSettings, bool), anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;
    let value = store.get("settings");
    let settings = match value.clone() {
        Some(raw) => serde_json::from_value::<AppSettings>(raw).unwrap_or_default(),
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

pub fn initialize_settings(app: &AppHandle) -> Result<(), anyhow::Error> {
    let (mut settings, has_existing) = load_settings_from_store(app)?;
    let original = serde_json::to_value(&settings)?;

    normalize_settings(&mut settings);
    let normalized = serde_json::to_value(&settings)?;
    if !has_existing || original != normalized {
        save_settings_to_store(app, &settings)?;
    }

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
