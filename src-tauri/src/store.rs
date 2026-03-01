use serde_json::json;
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILENAME: &str = "store.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct ModelConfig {
    pub provider: String,
    pub auth: String,
    pub api_url: String,
    pub model_name: String,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://api.openai.com/v1/chat/completions".to_string(),
            model_name: "gpt-4.1-mini".to_string(),
        }
    }
}

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
        let (modifier, symbol) = ("Meta", "⌘");
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
    pub model_type: String,
    pub model_configs: HashMap<String, ModelConfig>,
    pub custom_model: ModelConfig,
    pub phrases: Vec<Phrase>,
}

impl Default for AppSettings {
    fn default() -> Self {
        let model_configs = default_model_configs();
        let custom_model = model_configs
            .get("custom")
            .cloned()
            .unwrap_or_else(ModelConfig::default);

        Self {
            app_enabled: true,
            trans_hotkey: HotkeyConfig::default(),
            translation_from: "zh".to_string(),
            translation_to: "en".to_string(),
            game_scene: "dota2".to_string(),
            translation_mode: "auto".to_string(),
            daily_mode: false,
            model_type: "openai".to_string(),
            model_configs,
            custom_model,
            phrases: default_phrases(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_model_configs() -> HashMap<String, ModelConfig> {
    let mut configs = HashMap::new();

    configs.insert(
        "openai".to_string(),
        ModelConfig {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://api.openai.com/v1/chat/completions".to_string(),
            model_name: "gpt-4.1-mini".to_string(),
        },
    );

    configs.insert(
        "deepseek".to_string(),
        ModelConfig {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://api.deepseek.com/v1/chat/completions".to_string(),
            model_name: "deepseek-chat".to_string(),
        },
    );

    configs.insert(
        "qwen".to_string(),
        ModelConfig {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
                .to_string(),
            model_name: "qwen-plus".to_string(),
        },
    );

    configs.insert(
        "moonshot".to_string(),
        ModelConfig {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://api.moonshot.cn/v1/chat/completions".to_string(),
            model_name: "moonshot-v1-8k".to_string(),
        },
    );

    configs.insert(
        "siliconflow".to_string(),
        ModelConfig {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://api.siliconflow.cn/v1/chat/completions".to_string(),
            model_name: "deepseek-ai/DeepSeek-V3".to_string(),
        },
    );

    configs.insert(
        "anthropic".to_string(),
        ModelConfig {
            provider: "anthropic".to_string(),
            auth: String::new(),
            api_url: "https://api.anthropic.com/v1/messages".to_string(),
            model_name: "claude-3-5-haiku-latest".to_string(),
        },
    );

    configs.insert(
        "stepfun".to_string(),
        ModelConfig {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://api.stepfun.com/v1/chat/completions".to_string(),
            model_name: "step-2-16k".to_string(),
        },
    );

    configs.insert(
        "custom".to_string(),
        ModelConfig {
            provider: "openai".to_string(),
            auth: String::new(),
            api_url: "https://api.openai.com/v1/chat/completions".to_string(),
            model_name: "gpt-4.1-mini".to_string(),
        },
    );

    configs
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

fn normalize_model_type(model_type: &str) -> String {
    match model_type {
        "deepseek-R1" => "deepseek".to_string(),
        "custom" => "custom".to_string(),
        "openai" | "deepseek" | "qwen" | "moonshot" | "siliconflow" | "anthropic"
        | "stepfun" => model_type.to_string(),
        _ => "openai".to_string(),
    }
}

fn normalize_settings(settings: &mut AppSettings) {
    settings.model_type = normalize_model_type(&settings.model_type);

    for (key, default_config) in default_model_configs() {
        let current = settings
            .model_configs
            .entry(key)
            .or_insert_with(|| default_config.clone());

        if current.provider.is_empty() {
            current.provider = default_config.provider.clone();
        }
        if current.api_url.is_empty() {
            current.api_url = default_config.api_url.clone();
        }
        if current.model_name.is_empty() {
            current.model_name = default_config.model_name.clone();
        }
    }

    if settings.custom_model.api_url.is_empty() {
        if let Some(custom) = settings.model_configs.get("custom") {
            settings.custom_model = custom.clone();
        }
    }

    if let Some(custom) = settings.model_configs.get_mut("custom") {
        if custom.auth.is_empty() && !settings.custom_model.auth.is_empty() {
            custom.auth = settings.custom_model.auth.clone();
        }
        if custom.model_name.is_empty() && !settings.custom_model.model_name.is_empty() {
            custom.model_name = settings.custom_model.model_name.clone();
        }
        if custom.api_url.is_empty() && !settings.custom_model.api_url.is_empty() {
            custom.api_url = settings.custom_model.api_url.clone();
        }

        settings.custom_model = custom.clone();
    }

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
        settings.game_scene = "dota2".to_string();
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

pub fn initialize_settings(app: &AppHandle) -> Result<(), anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;

    let mut settings = match store.get("settings") {
        Some(value) => serde_json::from_value::<AppSettings>(value).unwrap_or_default(),
        None => AppSettings::default(),
    };

    normalize_settings(&mut settings);
    store.set("settings", json!(settings));
    store.save()?;
    store.close_resource();

    Ok(())
}

pub fn get_settings(app: &AppHandle) -> Result<AppSettings, anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;

    let mut settings = match store.get("settings") {
        Some(value) => serde_json::from_value::<AppSettings>(value).unwrap_or_default(),
        None => AppSettings::default(),
    };

    normalize_settings(&mut settings);
    store.set("settings", json!(settings.clone()));
    store.save()?;

    Ok(settings)
}

pub fn update_settings_field<T: serde::Serialize>(
    app: &AppHandle,
    field_updater: impl FnOnce(&mut AppSettings) -> T,
) -> Result<T, anyhow::Error> {
    let store = app.store(STORE_FILENAME)?;
    let mut settings = get_settings(app)?;

    let result = field_updater(&mut settings);
    normalize_settings(&mut settings);

    store.set("settings", json!(settings));
    store.save()?;

    Ok(result)
}
