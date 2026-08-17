use crate::ai_translator;
use anyhow::{anyhow, Result};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
#[cfg(target_os = "macos")]
use tauri_plugin_shell::ShellExt;
use tokio::time::sleep;

const COPY_SETTLE_MAX_ATTEMPTS: usize = 30;
const COPY_SETTLE_DELAY_MS: u64 = 20;
const CLIPBOARD_RESTORE_DELAY_MS: u64 = 350;
#[cfg(target_os = "windows")]
const MODIFIER_RELEASE_MAX_ATTEMPTS: usize = 60;
#[cfg(target_os = "windows")]
const MODIFIER_RELEASE_DELAY_MS: u64 = 10;

pub async fn trans_and_replace_text(app: &AppHandle) -> Result<()> {
    let clipboard_backup = app.clipboard().read_text().ok();
    let result = async {
        let total_started = Instant::now();

        let settings = crate::store::get_settings(app)?;
        if !settings.app_enabled {
            println!("应用已禁用，跳过翻译动作");
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            let modifier_started = Instant::now();
            wait_for_windows_modifiers_release().await?;
            println!(
                "[perf] modifier_release elapsed_ms={}",
                modifier_started.elapsed().as_millis()
            );
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
        let clipboard_started = Instant::now();
        let original_text = read_copied_text(app, &clipboard_probe).await?;
        println!(
            "[perf] clipboard_read elapsed_ms={}",
            clipboard_started.elapsed().as_millis()
        );
        println!("原始文本: {:?}", original_text);
        if original_text.trim().is_empty() {
            println!("剪贴板为空，跳过翻译");
            return Ok(());
        }

        // 3. 调用 AI 翻译
        let model_started = Instant::now();
        let translated = ai_translator::translate_with_gpt(&original_text, &settings).await?;
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
        Ok(is_meaningful_clipboard_text(
            &selected_text,
            &clipboard_probe,
        ))
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
        let _ = app;
        for key in keys {
            send_windows_control_shortcut(key)?;
            sleep(Duration::from_millis(20)).await;
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
async fn wait_for_windows_modifiers_release() -> Result<()> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };

    for attempt in 0..MODIFIER_RELEASE_MAX_ATTEMPTS {
        let modifier_down = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN]
            .into_iter()
            .any(|key| unsafe { GetAsyncKeyState(key as i32) } < 0);
        if !modifier_down {
            return Ok(());
        }
        if attempt + 1 < MODIFIER_RELEASE_MAX_ATTEMPTS {
            sleep(Duration::from_millis(MODIFIER_RELEASE_DELAY_MS)).await;
        }
    }

    Err(anyhow!("快捷键仍处于按下状态，请松开组合键后重试"))
}

#[cfg(target_os = "windows")]
fn send_windows_control_shortcut(key: &str) -> Result<()> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_A, VK_C,
        VK_CONTROL, VK_V,
    };

    let key_code = match key {
        "a" => VK_A,
        "c" => VK_C,
        "v" => VK_V,
        _ => return Err(anyhow!("不支持的 Windows 模拟按键: {key}")),
    };
    let input = |virtual_key, flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: virtual_key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let inputs = [
        input(VK_CONTROL, 0),
        input(key_code, 0),
        input(key_code, KEYEVENTF_KEYUP),
        input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent != inputs.len() as u32 {
        let error = std::io::Error::last_os_error();
        let release_inputs = [
            input(key_code, KEYEVENTF_KEYUP),
            input(VK_CONTROL, KEYEVENTF_KEYUP),
        ];
        unsafe {
            SendInput(
                release_inputs.len() as u32,
                release_inputs.as_ptr(),
                std::mem::size_of::<INPUT>() as i32,
            );
        }
        return Err(anyhow!(
            "Windows 按键模拟失败: 仅发送 {sent}/{} 个事件 ({})",
            inputs.len(),
            error
        ));
    }

    Ok(())
}

fn copy_shortcut_keys(daily_mode: bool) -> &'static [&'static str] {
    if daily_mode {
        &["c"]
    } else {
        &["a", "c"]
    }
}

fn paste_shortcut_keys(daily_mode: bool) -> &'static [&'static str] {
    if daily_mode {
        &["v"]
    } else {
        &["a", "v"]
    }
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
        sleep(Duration::from_millis(CLIPBOARD_RESTORE_DELAY_MS)).await;
        restore_clipboard(&app, &backup);
    });
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
        assert!(!is_meaningful_clipboard_text(
            "   ",
            "__LINGO_COPY_PROBE__1"
        ));
        assert!(!is_meaningful_clipboard_text(
            "__LINGO_COPY_PROBE__1",
            "__LINGO_COPY_PROBE__1"
        ));
        assert!(is_meaningful_clipboard_text(
            " hello ",
            "__LINGO_COPY_PROBE__1"
        ));
    }

    #[test]
    fn clipboard_probe_has_expected_prefix() {
        let probe = build_clipboard_probe();
        assert!(probe.starts_with("__LINGO_COPY_PROBE__"));
        assert!(probe.len() > "__LINGO_COPY_PROBE__".len());
    }

    #[test]
    fn clipboard_copy_wait_budget_handles_slow_targets() {
        let wait_budget_ms = COPY_SETTLE_MAX_ATTEMPTS as u64 * COPY_SETTLE_DELAY_MS;
        assert!(wait_budget_ms >= 600);
    }

    #[test]
    fn clipboard_restore_waits_for_target_to_consume_paste() {
        let restore_delay_ms = std::hint::black_box(CLIPBOARD_RESTORE_DELAY_MS);
        assert!(restore_delay_ms >= 350);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn modifier_release_wait_has_a_bounded_budget() {
        let wait_budget_ms = MODIFIER_RELEASE_MAX_ATTEMPTS as u64 * MODIFIER_RELEASE_DELAY_MS;
        assert!((500..=750).contains(&wait_budget_ms));
    }
}
