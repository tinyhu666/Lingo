use crate::ai_translator;
use anyhow::{anyhow, Result};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_shell::ShellExt;
use tokio::time::sleep;

const COPY_SETTLE_MAX_ATTEMPTS: usize = 8;
const COPY_SETTLE_DELAY_MS: u64 = 20;

pub async fn trans_and_replace_text(app: &AppHandle) -> Result<()> {
    let clipboard_backup = app.clipboard().read_text().ok();
    let result = async {
        let total_started = Instant::now();

        let settings = crate::store::get_settings(app)?;
        if !settings.app_enabled {
            println!("应用已禁用，跳过翻译动作");
            return Ok(());
        }

        let copy_started = Instant::now();
        let clipboard_probe = build_clipboard_probe();
        app.clipboard().write_text(&clipboard_probe)?;

        // 1. 复制选中文本
        simulate_keyboard_shortcuts(app, copy_shortcut_keys(settings.daily_mode)).await?;
        println!(
            "[perf] copy_phase elapsed_ms={}",
            copy_started.elapsed().as_millis()
        );

        // 2. 读取剪贴板内容
        let original_text = read_copied_text(app, &clipboard_probe).await?;
        println!("原始文本: {:?}", original_text);
        if original_text.trim().is_empty() {
            println!("剪贴板为空，跳过翻译");
            return Ok(());
        }

        let translation_finished = Arc::new(AtomicBool::new(false));
        let placeholder_shown = Arc::new(AtomicBool::new(false));
        if !settings.daily_mode {
            let translation_placeholder = resolve_translation_placeholder(app);
            schedule_translation_placeholder(
                app.clone(),
                translation_placeholder,
                Arc::clone(&translation_finished),
                Arc::clone(&placeholder_shown),
            );
        }

        // 3. 调用 AI 翻译
        let model_started = Instant::now();
        let translated_result = ai_translator::translate_with_gpt(&original_text, &settings).await;
        translation_finished.store(true, Ordering::Release);
        let translated = match translated_result {
            Ok(value) => value,
            Err(error) => {
                if placeholder_shown.load(Ordering::Acquire) {
                    restore_original_text(app, &original_text, settings.daily_mode).await?;
                }
                return Err(error);
            }
        };
        println!(
            "[perf] translate_request elapsed_ms={}",
            model_started.elapsed().as_millis()
        );
        println!("翻译结果: {:?}", translated);

        // 4. 粘贴翻译结果
        let paste_started = Instant::now();
        app.clipboard().write_text(translated)?;
        simulate_keyboard_shortcuts(app, paste_shortcut_keys(settings.daily_mode)).await?;
        println!(
            "[perf] paste_phase elapsed_ms={}",
            paste_started.elapsed().as_millis()
        );
        println!(
            "[perf] pipeline_total elapsed_ms={}",
            total_started.elapsed().as_millis()
        );

        Ok(())
    }
    .await;

    schedule_clipboard_restore(app.clone(), clipboard_backup);
    result
}

pub async fn has_text_selection(app: &AppHandle) -> Result<bool> {
    let clipboard_backup = app.clipboard().read_text().ok();
    let clipboard_probe = build_clipboard_probe();
    app.clipboard().write_text(&clipboard_probe)?;

    let result = async {
        simulate_keyboard_shortcuts(app, copy_shortcut_keys(true)).await?;
        let selected_text = read_copied_text(app, &clipboard_probe).await?;
        Ok(is_meaningful_clipboard_text(&selected_text, &clipboard_probe))
    }
    .await;

    restore_clipboard(app, &clipboard_backup);
    result
}

/// 模拟键盘组合键按下
async fn simulate_keyboard_shortcut(app: &AppHandle, key: &str) -> Result<()> {
    simulate_keyboard_shortcuts(app, &[key]).await
}

async fn simulate_keyboard_shortcuts(app: &AppHandle, keys: &[&str]) -> Result<()> {
    if keys.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let shell = app.shell();
        let mut script = String::from("tell application \"System Events\"\n");
        for key in keys {
            script.push_str(&format!("    keystroke \"{}\" using command down\n", key));
            script.push_str("    delay 0.03\n");
        }
        script.push_str("end tell\n");

        let output = shell
            .command("osascript")
            .args(["-e", &script])
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let message = if stderr.is_empty() {
                "按键模拟失败".to_string()
            } else {
                format!("按键模拟失败: {}", stderr)
            };
            return Err(anyhow!(message));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let shell = app.shell();
        let mut script = String::from("Add-Type -AssemblyName System.Windows.Forms\n");
        for key in keys {
            script.push_str(&format!(
                "[System.Windows.Forms.SendKeys]::SendWait(\"^{}\")\n",
                key
            ));
            script.push_str("Start-Sleep -Milliseconds 30\n");
        }

        let output = shell
            .command("powershell")
            .args(["-Command", &script])
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let message = if stderr.is_empty() {
                "按键模拟失败".to_string()
            } else {
                format!("按键模拟失败: {}", stderr)
            };
            return Err(anyhow!(message));
        }
    }

    Ok(())
}

fn copy_shortcut_keys(daily_mode: bool) -> &'static [&'static str] {
    if daily_mode { &["c"] } else { &["a", "c"] }
}

fn paste_shortcut_keys(daily_mode: bool) -> &'static [&'static str] {
    if daily_mode { &["v"] } else { &["a", "v"] }
}

pub async fn send_phrase(app: &AppHandle, phrase: &str) -> Result<()> {
    let clipboard_backup = app.clipboard().read_text().ok();
    let result = async {
        let settings = crate::store::get_settings(app)?;
        if !settings.app_enabled {
            println!("应用已禁用，跳过常用语发送");
            return Ok(());
        }

        // 将短语写入剪贴板
        app.clipboard().write_text(phrase)?;

        // 模拟粘贴操作
        simulate_keyboard_shortcut(app, "v").await?;

        Ok(())
    }
    .await;

    schedule_clipboard_restore(app.clone(), clipboard_backup);
    result
}

fn restore_clipboard(app: &AppHandle, backup: &Option<String>) {
    if let Some(content) = backup {
        if let Err(error) = app.clipboard().write_text(content) {
            eprintln!("恢复剪贴板失败: {}", error);
        }
    }
}

async fn read_copied_text(app: &AppHandle, clipboard_probe: &str) -> Result<String> {
    for attempt in 0..COPY_SETTLE_MAX_ATTEMPTS {
        let current = app.clipboard().read_text().unwrap_or_default();
        if is_meaningful_clipboard_text(&current, clipboard_probe) {
            return Ok(current);
        }

        if attempt + 1 < COPY_SETTLE_MAX_ATTEMPTS {
            sleep(Duration::from_millis(COPY_SETTLE_DELAY_MS)).await;
        }
    }

    Err(anyhow!("未检测到可翻译文本，请确认已选中文本后重试"))
}

fn schedule_clipboard_restore(app: AppHandle, backup: Option<String>) {
    if backup.is_none() {
        return;
    }

    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(120)).await;
        restore_clipboard(&app, &backup);
    });
}

fn schedule_translation_placeholder(
    app: AppHandle,
    placeholder_text: String,
    translation_finished: Arc<AtomicBool>,
    placeholder_shown: Arc<AtomicBool>,
) {
    tauri::async_runtime::spawn(async move {
        sleep(Duration::from_millis(350)).await;
        if translation_finished.load(Ordering::Acquire) {
            return;
        }

        if let Err(error) = app.clipboard().write_text(placeholder_text) {
            eprintln!("写入翻译占位提示失败: {}", error);
            return;
        }

        if let Err(error) = simulate_keyboard_shortcuts(&app, paste_shortcut_keys(false)).await {
            eprintln!("显示翻译占位提示失败: {}", error);
            return;
        }

        placeholder_shown.store(true, Ordering::Release);
    });
}

fn resolve_translation_placeholder(app: &AppHandle) -> String {
    let locale = crate::store::get_ui_locale(app).unwrap_or_else(|error| {
        eprintln!("读取 UI 语言失败，使用默认翻译占位提示: {}", error);
        "zh-CN".to_string()
    });

    translation_placeholder_text(&locale).to_string()
}

fn translation_placeholder_text(locale: &str) -> &'static str {
    let normalized = locale.trim().to_ascii_lowercase();

    if normalized.starts_with("en") {
        "Translating, please wait."
    } else if normalized.starts_with("ru") {
        "Идет перевод, пожалуйста, подождите."
    } else {
        "翻译中，请稍候"
    }
}

async fn restore_original_text(
    app: &AppHandle,
    original_text: &str,
    daily_mode: bool,
) -> Result<()> {
    app.clipboard().write_text(original_text)?;
    simulate_keyboard_shortcuts(app, paste_shortcut_keys(daily_mode)).await?;
    Ok(())
}

fn build_clipboard_probe() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("__LINGO_COPY_PROBE__{}", nanos)
}

fn is_meaningful_clipboard_text(current: &str, clipboard_probe: &str) -> bool {
    let trimmed = current.trim();
    !trimmed.is_empty() && trimmed != clipboard_probe
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_shortcut_keys_follow_mode() {
        assert_eq!(copy_shortcut_keys(false), &["a", "c"]);
        assert_eq!(copy_shortcut_keys(true), &["c"]);
    }

    #[test]
    fn paste_shortcut_keys_follow_mode() {
        assert_eq!(paste_shortcut_keys(false), &["a", "v"]);
        assert_eq!(paste_shortcut_keys(true), &["v"]);
    }

    #[test]
    fn meaningful_clipboard_text_ignores_probe_and_empty_values() {
        assert!(!is_meaningful_clipboard_text("", "__LINGO_COPY_PROBE__1"));
        assert!(!is_meaningful_clipboard_text("   ", "__LINGO_COPY_PROBE__1"));
        assert!(!is_meaningful_clipboard_text("__LINGO_COPY_PROBE__1", "__LINGO_COPY_PROBE__1"));
        assert!(is_meaningful_clipboard_text(" hello ", "__LINGO_COPY_PROBE__1"));
    }

    #[test]
    fn clipboard_probe_has_expected_prefix() {
        let probe = build_clipboard_probe();
        assert!(probe.starts_with("__LINGO_COPY_PROBE__"));
        assert!(probe.len() > "__LINGO_COPY_PROBE__".len());
    }

    #[test]
    fn translation_placeholder_text_follows_locale() {
        assert_eq!(translation_placeholder_text("zh-CN"), "翻译中，请稍候");
        assert_eq!(
            translation_placeholder_text("en-US"),
            "Translating, please wait."
        );
        assert_eq!(
            translation_placeholder_text("ru-RU"),
            "Идет перевод, пожалуйста, подождите."
        );
        assert_eq!(translation_placeholder_text("unknown"), "翻译中，请稍候");
    }
}
