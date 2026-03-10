use crate::store::initialize_settings;
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::Serialize;
use serde_json::Value;
use tauri::Manager;
pub mod ai_translator;
pub mod shell_helper;
pub mod shortcut;
pub mod store;
pub mod tray;

const RELEASE_LATEST_JSON_URL: &str = "https://github.com/tinyhu666/Lingo/releases/latest/download/latest.json";
const RELEASE_API_URL: &str = "https://api.github.com/repos/tinyhu666/Lingo/releases/latest";

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseMetadata {
    version: Option<String>,
    published_at: Option<String>,
    body: Option<String>,
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
        published_at: pick_release_date(payload, &["pub_date", "published_at", "created_at"]),
        body: value_as_non_empty_string(payload.get("notes")),
    }
}

fn extract_from_release_api(payload: &Value) -> ReleaseMetadata {
    ReleaseMetadata {
        version: normalize_version(value_as_non_empty_string(payload.get("tag_name"))),
        published_at: pick_release_date(payload, &["published_at", "created_at"]),
        body: value_as_non_empty_string(payload.get("body")),
    }
}

async fn fetch_release_json(url: &str) -> Result<Value, String> {
    let client = reqwest::Client::new();
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
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn update_translator_shortcut(
    app_handle: tauri::AppHandle,
    keys: Vec<String>,
) -> Result<(), String> {
    shortcut::update_translator_shortcut(&app_handle, keys)
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

    store::get_settings(&app_handle).map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_phrases(
    app_handle: tauri::AppHandle,
    phrases: Vec<store::Phrase>,
) -> Result<Vec<store::Phrase>, String> {
    shortcut::update_phrases(&app_handle, phrases)
}

#[tauri::command]
async fn get_latest_release_metadata() -> Result<ReleaseMetadata, String> {
    let manifest = fetch_release_json(RELEASE_LATEST_JSON_URL)
        .await
        .ok()
        .map(|payload| extract_from_manifest(&payload));
    let release_api = fetch_release_json(RELEASE_API_URL)
        .await
        .ok()
        .map(|payload| extract_from_release_api(&payload));

    if manifest.is_none() && release_api.is_none() {
        return Err("failed to load release metadata".to_string());
    }

    let mut merged = ReleaseMetadata::default();

    if let Some(manifest_data) = manifest {
        merged.version = manifest_data.version;
        merged.published_at = manifest_data.published_at;
        merged.body = manifest_data.body;
    }

    if let Some(api_data) = release_api {
        merged.version = merged.version.or(api_data.version);
        merged.published_at = merged.published_at.or(api_data.published_at);
        merged.body = api_data.body.or(merged.body);
    }

    Ok(merged)
}

pub fn run() {
    println!("Starting application...");

    let mut builder = tauri::Builder::default()
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
            match initialize_settings(&app.app_handle()) {
                Ok(_) => println!("应用设置初始化完成"),
                Err(e) => eprintln!("初始化设置失败: {}", e),
            }

            // 初始化所有快捷键
            println!("正在注册全局快捷键...");
            match shortcut::init_shortcuts(&app.app_handle()) {
                Ok(_) => println!("快捷键设置成功"),
                Err(e) => eprintln!("注册全局快捷键失败: {}", e),
            }

            // 创建AI模型托盘
            match tray::create_tray(&app.app_handle()) {
                Ok(_) => println!("托盘创建成功"),
                Err(e) => eprintln!("创建托盘失败: {}", e),
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            update_translator_shortcut,
            log_to_backend,
            get_settings,
            get_version,
            set_app_enabled,
            update_phrases,
            get_latest_release_metadata
        ]);

    // 只在非Windows系统上添加窗口事件监听
    #[cfg(not(target_os = "windows"))]
    {
        builder = builder.on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                #[cfg(target_os = "macos")]
                let _ = window
                    .app_handle()
                    .set_activation_policy(tauri::ActivationPolicy::Accessory);
                api.prevent_close();
            }
            _ => {}
        });
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
