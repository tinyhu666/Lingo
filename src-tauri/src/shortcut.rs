use crate::shell_helper::{send_phrase, trans_and_replace_text};
use crate::store::{get_settings, update_settings_field, HotkeyConfig, Phrase};
use std::collections::HashSet;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

static TRANSLATION_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

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
                return;
            }

            let app_clone = Arc::clone(&app);
            tauri::async_runtime::spawn(async move {
                if let Err(e) = trans_and_replace_text(app_clone.as_ref()).await {
                    println!("翻译替换失败: {:?}", e);
                }
                TRANSLATION_IN_FLIGHT.store(false, Ordering::Release);
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

    register_shortcut(
        app,
        &settings.trans_hotkey.modifiers,
        &settings.trans_hotkey.key,
        create_trans_handler(app.clone()),
    )?;

    register_phrase_shortcuts(app, &settings.phrases)?;
    Ok(())
}

pub fn init_shortcuts(app: &AppHandle) -> Result<(), String> {
    let settings = get_settings(app).map_err(|e| e.to_string())?;
    rebind_all_shortcuts(app, &settings)
}

pub fn update_translator_shortcut(app: &AppHandle, keys: Vec<String>) -> Result<(), String> {
    let raw_modifiers = keys
        .iter()
        .filter(|k| is_modifier_key(k))
        .cloned()
        .collect::<Vec<_>>();
    let modifiers = normalize_modifiers(&raw_modifiers);
    let key = keys
        .iter()
        .rev()
        .find(|k| !is_modifier_key(k))
        .cloned()
        .unwrap_or_default();

    if modifiers.is_empty() || key.is_empty() {
        return Err(
            "快捷键必须包含至少一个修饰键(Control/Alt/Shift/Command)和一个其他按键".to_string(),
        );
    }

    Code::from_str(&key).map_err(|_| "快捷键主键无效，请重试".to_string())?;

    let settings = get_settings(app).map_err(|e| e.to_string())?;
    let trans_sig = shortcut_signature(&modifiers, &key);

    for phrase in &settings.phrases {
        let sig = shortcut_signature(
            &normalize_modifiers(&phrase.hotkey.modifiers),
            &phrase.hotkey.key,
        );
        if sig == trans_sig {
            return Err("该快捷键已被常用语占用，请更换组合".to_string());
        }
    }

    let new_hotkey = HotkeyConfig {
        shortcut: build_shortcut_text(&modifiers, &key),
        modifiers,
        key,
    };

    update_settings_field(app, |settings| {
        settings.trans_hotkey = new_hotkey;
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
    if key.starts_with("Key") {
        key[3..].to_string()
    } else if key.starts_with("Digit") {
        key[5..].to_string()
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
