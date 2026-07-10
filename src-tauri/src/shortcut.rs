use crate::shell_helper::{send_phrase, trans_and_replace_text};
use crate::store::{get_settings, update_settings_field, HotkeyConfig, Phrase};
use std::collections::HashSet;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

static TRANSLATION_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

struct InFlightGuard;

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        TRANSLATION_IN_FLIGHT.store(false, Ordering::Release);
    }
}

fn parse_modifiers(modifiers: &[String]) -> Modifiers {
    let mut result = Modifiers::empty();
    for modifier in modifiers {
        match modifier.as_str() {
            "Control" | "ControlLeft" | "ControlRight" => result |= Modifiers::CONTROL,
            "Alt" | "AltLeft" | "AltRight" => result |= Modifiers::ALT,
            "Shift" | "ShiftLeft" | "ShiftRight" => result |= Modifiers::SHIFT,
            "Meta" | "MetaLeft" | "MetaRight" => result |= Modifiers::META,
            _ => {}
        }
    }
    result
}

fn is_modifier_key(key: &str) -> bool {
    matches!(
        key,
        "Control"
            | "ControlLeft"
            | "ControlRight"
            | "Alt"
            | "AltLeft"
            | "AltRight"
            | "Shift"
            | "ShiftLeft"
            | "ShiftRight"
            | "Meta"
            | "MetaLeft"
            | "MetaRight"
    )
}

fn normalize_modifiers(modifiers: &[String]) -> Vec<String> {
    let mut normalized = modifiers
        .iter()
        .map(|m| m.replace("Left", "").replace("Right", ""))
        .filter(|m| matches!(m.as_str(), "Control" | "Alt" | "Shift" | "Meta"))
        .collect::<Vec<_>>();

    normalized.sort();
    normalized.dedup();
    normalized
}

fn shortcut_signature(modifiers: &[String], key: &str) -> String {
    format!("{}+{}", modifiers.join("+"), key)
}

fn register_shortcut<F>(
    app: &AppHandle,
    modifiers: &[String],
    key: &str,
    handler: F,
) -> Result<(), String>
where
    F: Fn(&AppHandle, &Shortcut, ShortcutEvent) + Send + Sync + 'static,
{
    let code = Code::from_str(key).map_err(|_| format!("无效的按键代码: {}", key))?;
    let shortcut = Shortcut::new(Some(parse_modifiers(modifiers)), code);

    app.global_shortcut()
        .on_shortcut(shortcut, handler)
        .map_err(|e| format!("注册快捷键失败: {}", e))
}

fn build_shortcut_text(modifiers: &[String], key: &str) -> String {
    format!(
        "{}+{}",
        modifiers
            .iter()
            .map(|m| match m.as_str() {
                "Control" => {
                    if cfg!(target_os = "macos") {
                        "⌃"
                    } else {
                        "Ctrl"
                    }
                }
                "Alt" => {
                    if cfg!(target_os = "macos") {
                        "⌥"
                    } else {
                        "Alt"
                    }
                }
                "Shift" => "⇧",
                "Meta" => {
                    if cfg!(target_os = "macos") {
                        "⌘"
                    } else {
                        "Win"
                    }
                }
                _ => m,
            })
            .collect::<Vec<_>>()
            .join("+"),
        format_key_display(key)
    )
}

fn create_trans_handler(
    app: AppHandle,
) -> impl Fn(&AppHandle, &Shortcut, ShortcutEvent) + Send + Sync + 'static {
    let app = Arc::new(app);
    move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            if TRANSLATION_IN_FLIGHT
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
            {
                println!("翻译任务进行中，忽略重复触发");
                let _ = app.emit("translation_busy", "busy");
                return;
            }

            let app_clone = Arc::clone(&app);
            tauri::async_runtime::spawn(async move {
                let _guard = InFlightGuard;
                if let Err(e) = trans_and_replace_text(app_clone.as_ref()).await {
                    println!("翻译替换失败: {:?}", e);
                    let _ = app_clone.emit("translation_failed", format!("翻译失败：{}", e));
                }
            });
        }
    }
}

fn create_phrase_handler(
    app: AppHandle,
    phrase_text: String,
) -> impl Fn(&AppHandle, &Shortcut, ShortcutEvent) + Send + Sync + 'static {
    let app = Arc::new(app);
    move |_app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            let app_clone = Arc::clone(&app);
            let phrase_text = phrase_text.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = send_phrase(app_clone.as_ref(), &phrase_text).await {
                    println!("发送常用语失败: {:?}", e);
                }
            });
        }
    }
}

fn create_incoming_toggle_handler(
    app: AppHandle,
) -> impl Fn(&AppHandle, &Shortcut, ShortcutEvent) + Send + Sync + 'static {
    let app = Arc::new(app);
    move |_app, _shortcut, event| {
        if event.state() != ShortcutState::Pressed {
            return;
        }
        let app_clone = Arc::clone(&app);
        tauri::async_runtime::spawn(async move {
            let current = match crate::store::get_settings(app_clone.as_ref()) {
                Ok(s) => s,
                Err(error) => {
                    eprintln!("incoming toggle hotkey: read settings failed: {error}");
                    return;
                }
            };
            let next = !current.incoming_enabled;
            let pipeline_state =
                app_clone.state::<std::sync::Arc<crate::incoming::IncomingPipeline>>();
            if let Err(error) =
                crate::apply_incoming_enabled(app_clone.as_ref(), pipeline_state.inner(), next)
            {
                eprintln!("incoming toggle hotkey: apply failed: {error}");
            }
        });
    }
}

fn create_click_through_handler(
    app: AppHandle,
) -> impl Fn(&AppHandle, &Shortcut, ShortcutEvent) + Send + Sync + 'static {
    let app = Arc::new(app);
    move |_app, _shortcut, event| {
        if event.state() != ShortcutState::Pressed {
            return;
        }
        let app_clone = Arc::clone(&app);
        tauri::async_runtime::spawn(async move {
            let current = match crate::store::get_settings(app_clone.as_ref()) {
                Ok(s) => s,
                Err(error) => {
                    eprintln!("click-through hotkey: read settings failed: {error}");
                    return;
                }
            };
            // Only meaningful when the overlay is potentially visible.
            // If incoming is disabled we silently do nothing instead of
            // surfacing a confusing error.
            if !current.incoming_enabled {
                return;
            }
            let next = !current.incoming_overlay.click_through;
            if let Err(error) = crate::apply_click_through(app_clone.as_ref(), next) {
                eprintln!("click-through hotkey: apply failed: {error}");
            }
        });
    }
}

fn register_phrase_shortcuts(app: &AppHandle, phrases: &[Phrase]) -> Result<(), String> {
    for phrase in phrases {
        register_shortcut(
            app,
            &phrase.hotkey.modifiers,
            &phrase.hotkey.key,
            create_phrase_handler(app.clone(), phrase.phrase.clone()),
        )?;
    }
    Ok(())
}

fn rebind_all_shortcuts(
    app: &AppHandle,
    settings: &crate::store::AppSettings,
) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();
    if let Err(e) = global_shortcut.unregister_all() {
        println!("清理旧快捷键失败(忽略): {}", e);
    }

    let mut used_signatures: HashSet<String> = HashSet::new();

    let trans_modifiers = normalize_modifiers(&settings.trans_hotkey.modifiers);
    register_shortcut(
        app,
        &settings.trans_hotkey.modifiers,
        &settings.trans_hotkey.key,
        create_trans_handler(app.clone()),
    )?;
    used_signatures.insert(shortcut_signature(
        &trans_modifiers,
        &settings.trans_hotkey.key,
    ));

    register_phrase_shortcuts(app, &settings.phrases)?;
    for phrase in &settings.phrases {
        used_signatures.insert(shortcut_signature(
            &normalize_modifiers(&phrase.hotkey.modifiers),
            &phrase.hotkey.key,
        ));
    }

    // Incoming hotkeys are registered last and tolerate failure so a
    // conflict with the translator / phrases doesn't leave the user with
    // an unusable app. We just log + skip — they can rebind in Settings.
    try_register_optional_shortcut(
        app,
        "incoming-toggle",
        &settings.incoming_toggle_hotkey,
        &mut used_signatures,
        || create_incoming_toggle_handler(app.clone()),
    );
    try_register_optional_shortcut(
        app,
        "incoming-click-through",
        &settings.incoming_click_through_hotkey,
        &mut used_signatures,
        || create_click_through_handler(app.clone()),
    );

    Ok(())
}

fn try_register_optional_shortcut<F, H>(
    app: &AppHandle,
    label: &str,
    hotkey: &crate::store::HotkeyConfig,
    used_signatures: &mut HashSet<String>,
    make_handler: F,
) where
    F: FnOnce() -> H,
    H: Fn(&AppHandle, &Shortcut, ShortcutEvent) + Send + Sync + 'static,
{
    if hotkey.key.is_empty() || hotkey.modifiers.is_empty() {
        eprintln!("[shortcut] skipping {label}: empty key or modifiers");
        return;
    }
    let modifiers = normalize_modifiers(&hotkey.modifiers);
    let signature = shortcut_signature(&modifiers, &hotkey.key);
    if !used_signatures.insert(signature.clone()) {
        eprintln!(
            "[shortcut] skipping {label}: hotkey {signature} collides with an existing binding"
        );
        return;
    }
    if let Err(error) = register_shortcut(app, &hotkey.modifiers, &hotkey.key, make_handler()) {
        eprintln!("[shortcut] failed to register {label} ({signature}): {error}");
        used_signatures.remove(&signature);
    }
}

pub fn init_shortcuts(app: &AppHandle) -> Result<(), String> {
    let settings = get_settings(app).map_err(|e| e.to_string())?;
    rebind_all_shortcuts(app, &settings)
}

/// Validate user-pressed keys and turn them into a normalized
/// [`HotkeyConfig`]. Shared by every hotkey-rebind entry point so the
/// "exactly one main key + at least one modifier + valid Code" contract
/// stays consistent.
fn build_hotkey_from_keys(keys: &[String]) -> Result<HotkeyConfig, String> {
    let raw_modifiers = keys
        .iter()
        .filter(|k| is_modifier_key(k))
        .cloned()
        .collect::<Vec<_>>();
    let modifiers = normalize_modifiers(&raw_modifiers);
    let main_keys: Vec<&String> = keys.iter().filter(|k| !is_modifier_key(k)).collect();

    if main_keys.len() > 1 {
        return Err("快捷键只能包含一个主键(Control/Alt/Shift/Command 之外的按键)".to_string());
    }

    let key = main_keys.first().map(|k| (*k).clone()).unwrap_or_default();

    if modifiers.is_empty() || key.is_empty() {
        return Err(
            "快捷键必须包含至少一个修饰键(Control/Alt/Shift/Command)和一个其他按键".to_string(),
        );
    }

    Code::from_str(&key).map_err(|_| "快捷键主键无效，请重试".to_string())?;

    Ok(HotkeyConfig {
        shortcut: build_shortcut_text(&modifiers, &key),
        modifiers,
        key,
    })
}

/// Returns Ok(()) if `signature` doesn't collide with any other
/// known shortcut. `self_label` is the field being assigned so callers
/// can produce a helpful "won't conflict with itself" exclusion (we
/// pass it through to skip the comparison against the same field).
fn ensure_no_signature_conflict(
    settings: &crate::store::AppSettings,
    candidate: &str,
    self_label: HotkeyOwner,
) -> Result<(), String> {
    let trans_sig = shortcut_signature(
        &normalize_modifiers(&settings.trans_hotkey.modifiers),
        &settings.trans_hotkey.key,
    );
    let incoming_toggle_sig = shortcut_signature(
        &normalize_modifiers(&settings.incoming_toggle_hotkey.modifiers),
        &settings.incoming_toggle_hotkey.key,
    );
    let incoming_lock_sig = shortcut_signature(
        &normalize_modifiers(&settings.incoming_click_through_hotkey.modifiers),
        &settings.incoming_click_through_hotkey.key,
    );

    if self_label != HotkeyOwner::Translator && candidate == trans_sig {
        return Err("该快捷键已被翻译快捷键占用，请更换组合".to_string());
    }
    if self_label != HotkeyOwner::IncomingToggle && candidate == incoming_toggle_sig {
        return Err("该快捷键已被入向翻译切换占用，请更换组合".to_string());
    }
    if self_label != HotkeyOwner::IncomingClickThrough && candidate == incoming_lock_sig {
        return Err("该快捷键已被锁定到游戏占用，请更换组合".to_string());
    }
    for phrase in &settings.phrases {
        let sig = shortcut_signature(
            &normalize_modifiers(&phrase.hotkey.modifiers),
            &phrase.hotkey.key,
        );
        if sig == candidate {
            return Err("该快捷键已被常用语占用，请更换组合".to_string());
        }
    }
    Ok(())
}

#[derive(PartialEq, Eq)]
enum HotkeyOwner {
    Translator,
    IncomingToggle,
    IncomingClickThrough,
}

pub fn update_translator_shortcut(app: &AppHandle, keys: Vec<String>) -> Result<(), String> {
    let new_hotkey = build_hotkey_from_keys(&keys)?;
    let settings = get_settings(app).map_err(|e| e.to_string())?;
    let candidate = shortcut_signature(&new_hotkey.modifiers, &new_hotkey.key);
    ensure_no_signature_conflict(&settings, &candidate, HotkeyOwner::Translator)?;

    update_settings_field(app, |settings| {
        settings.trans_hotkey = new_hotkey;
    })
    .map_err(|e| e.to_string())?;

    let new_settings = get_settings(app).map_err(|e| e.to_string())?;
    rebind_all_shortcuts(app, &new_settings)
}

pub fn update_incoming_toggle_shortcut(app: &AppHandle, keys: Vec<String>) -> Result<(), String> {
    let new_hotkey = build_hotkey_from_keys(&keys)?;
    let settings = get_settings(app).map_err(|e| e.to_string())?;
    let candidate = shortcut_signature(&new_hotkey.modifiers, &new_hotkey.key);
    ensure_no_signature_conflict(&settings, &candidate, HotkeyOwner::IncomingToggle)?;

    update_settings_field(app, |settings| {
        settings.incoming_toggle_hotkey = new_hotkey;
    })
    .map_err(|e| e.to_string())?;

    let new_settings = get_settings(app).map_err(|e| e.to_string())?;
    rebind_all_shortcuts(app, &new_settings)
}

pub fn update_incoming_click_through_shortcut(
    app: &AppHandle,
    keys: Vec<String>,
) -> Result<(), String> {
    let new_hotkey = build_hotkey_from_keys(&keys)?;
    let settings = get_settings(app).map_err(|e| e.to_string())?;
    let candidate = shortcut_signature(&new_hotkey.modifiers, &new_hotkey.key);
    ensure_no_signature_conflict(&settings, &candidate, HotkeyOwner::IncomingClickThrough)?;

    update_settings_field(app, |settings| {
        settings.incoming_click_through_hotkey = new_hotkey;
    })
    .map_err(|e| e.to_string())?;

    let new_settings = get_settings(app).map_err(|e| e.to_string())?;
    rebind_all_shortcuts(app, &new_settings)
}

pub fn update_phrases(app: &AppHandle, phrases: Vec<Phrase>) -> Result<Vec<Phrase>, String> {
    if phrases.is_empty() {
        return Err("请至少保留一条常用语".to_string());
    }
    if phrases.len() > 20 {
        return Err("常用语最多 20 条".to_string());
    }

    let settings = get_settings(app).map_err(|e| e.to_string())?;
    let trans_sig = shortcut_signature(
        &normalize_modifiers(&settings.trans_hotkey.modifiers),
        &settings.trans_hotkey.key,
    );

    let mut seen_hotkeys = HashSet::new();
    let mut normalized = Vec::with_capacity(phrases.len());

    for (idx, phrase) in phrases.into_iter().enumerate() {
        let text = phrase.phrase.trim().to_string();
        if text.is_empty() {
            return Err(format!("第 {} 条常用语为空", idx + 1));
        }
        if text.chars().count() > 120 {
            return Err(format!("第 {} 条常用语超过 120 字", idx + 1));
        }

        let modifiers = normalize_modifiers(&phrase.hotkey.modifiers);
        if modifiers.is_empty() || phrase.hotkey.key.trim().is_empty() {
            return Err(format!("第 {} 条常用语的快捷键无效", idx + 1));
        }

        let key = phrase.hotkey.key.trim().to_string();
        Code::from_str(&key).map_err(|_| format!("第 {} 条常用语的按键代码无效", idx + 1))?;

        let sig = shortcut_signature(&modifiers, &key);
        if sig == trans_sig {
            return Err(format!("第 {} 条常用语与翻译快捷键冲突", idx + 1));
        }
        if !seen_hotkeys.insert(sig) {
            return Err(format!("第 {} 条常用语与其他常用语快捷键重复", idx + 1));
        }

        normalized.push(Phrase {
            id: (idx + 1) as i32,
            phrase: text,
            hotkey: HotkeyConfig {
                shortcut: build_shortcut_text(&modifiers, &key),
                modifiers,
                key,
            },
        });
    }

    let normalized_for_store = normalized.clone();
    update_settings_field(app, move |settings| {
        settings.phrases = normalized_for_store;
    })
    .map_err(|e| e.to_string())?;

    let new_settings = get_settings(app).map_err(|e| e.to_string())?;
    rebind_all_shortcuts(app, &new_settings)?;

    Ok(new_settings.phrases)
}

fn format_key_display(key: &str) -> String {
    if let Some(stripped) = key.strip_prefix("Key") {
        stripped.to_string()
    } else if let Some(stripped) = key.strip_prefix("Digit") {
        stripped.to_string()
    } else if key.starts_with("Arrow") {
        match key {
            "ArrowUp" => "↑".to_string(),
            "ArrowDown" => "↓".to_string(),
            "ArrowLeft" => "←".to_string(),
            "ArrowRight" => "→".to_string(),
            _ => key.to_string(),
        }
    } else {
        match key {
            "Space" => "空格".to_string(),
            "Tab" => "Tab".to_string(),
            "Enter" => "↵".to_string(),
            "Backspace" => "⌫".to_string(),
            "Delete" => "Del".to_string(),
            "Escape" => "Esc".to_string(),
            "CapsLock" => "⇪".to_string(),
            _ => key.to_string(),
        }
    }
}
