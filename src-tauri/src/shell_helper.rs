use crate::ai_translator;
use anyhow::{anyhow, Result};
use std::time::Instant;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_shell::ShellExt;

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
        // 1. 复制选中文本
        if !settings.daily_mode {
            simulate_keyboard_shortcuts(app, &["a", "c"]).await?;
        } else {
            simulate_keyboard_shortcut(app, "c").await?;
        }
        println!(
            "[perf] copy_phase elapsed_ms={}",
            copy_started.elapsed().as_millis()
        );

        // 2. 读取剪贴板内容
        let original_text = app.clipboard().read_text()?;
        println!("原始文本: {:?}", original_text);
        if original_text.trim().is_empty() {
            println!("剪贴板为空，跳过翻译");
            return Ok(());
        }

        if !settings.daily_mode {
            // 3. 如果是游戏模式 -> 显示翻译状态
            let status_text = format!(
                "Lingo 翻译中... ({}→{} | 场景:{} | 风格:{})",
                settings.translation_from,
                settings.translation_to,
                settings.game_scene,
                settings.translation_mode
            );
            app.clipboard().write_text(&status_text)?;

            // 4. 粘贴状态文本
            simulate_keyboard_shortcuts(app, &["a", "v"]).await?;
        }

        // 5. 调用AI翻译
        let model_started = Instant::now();
        let translated = ai_translator::translate_with_gpt(app, &original_text).await?;
        println!(
            "[perf] translate_request elapsed_ms={}",
            model_started.elapsed().as_millis()
        );
        println!("翻译结果: {:?}", translated);

        // 6. 粘贴翻译结果
        let paste_started = Instant::now();
        app.clipboard().write_text(translated)?;
        if !settings.daily_mode {
            simulate_keyboard_shortcuts(app, &["a", "v"]).await?;
        } else {
            simulate_keyboard_shortcut(app, "v").await?;
        }
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

    restore_clipboard(app, &clipboard_backup);
    result
}

pub async fn has_text_selection(app: &AppHandle) -> Result<bool> {
    // 模拟 Cmd+C/Ctrl+C
    simulate_keyboard_shortcut(app, "c").await?;

    // 读取复制后的剪贴板内容
    let new_clipboard = app.clipboard().read_text().unwrap_or_default();

    // 如果新的剪贴板内容不为空，说明有选中的文本
    let has_selection = !new_clipboard.is_empty();

    Ok(has_selection)
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

    restore_clipboard(app, &clipboard_backup);
    result
}

fn restore_clipboard(app: &AppHandle, backup: &Option<String>) {
    if let Some(content) = backup {
        if let Err(error) = app.clipboard().write_text(content) {
            eprintln!("恢复剪贴板失败: {}", error);
        }
    }
}
