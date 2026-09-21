use crate::ai_translator;
use crate::translation_diagnostics::{self, DiagnosticMetadata};
use anyhow::{anyhow, Result};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
#[cfg(target_os = "macos")]
use tauri_plugin_shell::ShellExt;
use tokio::time::sleep;

const COPY_SETTLE_TIMEOUT_MS: u64 = 1500;
const COPY_SETTLE_DELAY_MS: u64 = 20;
const CLIPBOARD_RESTORE_DELAY_MS: u64 = 350;
// All clipboard users share this non-queued lock, including the restore delay.
static CLIPBOARD_OPERATION: tauri::async_runtime::Mutex<()> =
    tauri::async_runtime::Mutex::const_new(());
#[cfg(target_os = "windows")]
const MODIFIER_RELEASE_TIMEOUT_MS: u64 = 2000;

fn emit_stage_failure(
    app: &AppHandle,
    operation_id: &str,
    stage: &str,
    total_started: Instant,
    error: &anyhow::Error,
) {
    translation_diagnostics::emit(
        app,
        operation_id,
        stage,
        "failed",
        total_started.elapsed().as_millis() as u64,
        DiagnosticMetadata {
            error_code: Some(format!("{stage}_failed")),
            error_message: Some(error.to_string()),
            ..Default::default()
        },
    );
}

pub async fn trans_and_replace_text(app: &AppHandle, operation_id: &str) -> Result<()> {
    let _clipboard_guard = CLIPBOARD_OPERATION
        .try_lock()
        .map_err(|_| anyhow!("文本操作进行中，请稍后重试"))?;
    let clipboard_backup = app.clipboard().read_text().ok();
    let mut owned_clipboard = None;
    let result = async {
        let total_started = Instant::now();
        translation_diagnostics::emit(
            app,
            operation_id,
            "pipeline",
            "started",
            0,
            DiagnosticMetadata::default(),
        );

        let settings = match crate::store::get_settings(app) {
            Ok(settings) => settings,
            Err(error) => {
                let error = anyhow!(error);
                emit_stage_failure(app, operation_id, "settings", total_started, &error);
                return Err(error);
            }
        };
        if !settings.app_enabled {
            println!("应用已禁用，跳过翻译动作");
            translation_diagnostics::emit(
                app,
                operation_id,
                "pipeline",
                "skipped",
                total_started.elapsed().as_millis() as u64,
                DiagnosticMetadata {
                    error_code: Some("app_disabled".to_string()),
                    ..Default::default()
                },
            );
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        let target_window = windows_foreground_window();
        #[cfg(target_os = "windows")]
        {
            let modifier_started = Instant::now();
            if let Err(error) = wait_for_windows_modifiers_release().await {
                emit_stage_failure(app, operation_id, "modifier_release", total_started, &error);
                return Err(error);
            }
            println!(
                "[perf] modifier_release elapsed_ms={}",
                modifier_started.elapsed().as_millis()
            );
        }

        let copy_started = Instant::now();
        let clipboard_probe = build_clipboard_probe();
        if let Err(error) = app.clipboard().write_text(&clipboard_probe) {
            let error = anyhow!(error);
            emit_stage_failure(app, operation_id, "clipboard_probe", total_started, &error);
            return Err(error);
        }

        owned_clipboard = Some(clipboard_probe.clone());
        #[cfg(target_os = "windows")]
        if let Err(error) = ensure_windows_target(target_window) {
            emit_stage_failure(app, operation_id, "copy", total_started, &error);
            return Err(error);
        }

        // 1. 复制选中文本
        if let Err(error) =
            simulate_keyboard_shortcuts(app, copy_shortcut_keys(settings.daily_mode), None).await
        {
            emit_stage_failure(app, operation_id, "copy", total_started, &error);
            return Err(error);
        }
        println!(
            "[perf] copy_phase elapsed_ms={}",
            copy_started.elapsed().as_millis()
        );
        translation_diagnostics::emit(
            app,
            operation_id,
            "copy",
            "completed",
            total_started.elapsed().as_millis() as u64,
            DiagnosticMetadata::default(),
        );

        // 2. 读取剪贴板内容
        let clipboard_started = Instant::now();
        let original_text = match read_copied_text(app, &clipboard_probe).await {
            Ok(text) => text,
            Err(error) => {
                emit_stage_failure(app, operation_id, "clipboard_read", total_started, &error);
                return Err(error);
            }
        };
        println!(
            "[perf] clipboard_read elapsed_ms={}",
            clipboard_started.elapsed().as_millis()
        );
        if original_text.trim().is_empty() {
            println!("剪贴板为空，跳过翻译");
            translation_diagnostics::emit(
                app,
                operation_id,
                "clipboard_read",
                "skipped",
                total_started.elapsed().as_millis() as u64,
                DiagnosticMetadata {
                    text_length: Some(0),
                    error_code: Some("empty_selection".to_string()),
                    ..Default::default()
                },
            );
            return Ok(());
        }
        owned_clipboard = Some(original_text.clone());
        let text_length = original_text.chars().count();
        translation_diagnostics::emit(
            app,
            operation_id,
            "clipboard_read",
            "completed",
            total_started.elapsed().as_millis() as u64,
            DiagnosticMetadata {
                text_length: Some(text_length),
                ..Default::default()
            },
        );

        // 3. 调用 AI 翻译
        let model_started = Instant::now();
        translation_diagnostics::emit(
            app,
            operation_id,
            "request",
            "started",
            total_started.elapsed().as_millis() as u64,
            DiagnosticMetadata {
                text_length: Some(text_length),
                translation_from: Some(settings.translation_from.clone()),
                translation_to: Some(settings.translation_to.clone()),
                translation_mode: Some(settings.translation_mode.clone()),
                game_scene: Some(settings.game_scene.clone()),
                daily_mode: Some(settings.daily_mode),
                ..Default::default()
            },
        );
        let translated = match ai_translator::translate_with_gpt(
            &original_text,
            &settings,
            operation_id,
        )
        .await
        {
            Ok(translated) => translated,
            Err(error) => {
                emit_stage_failure(app, operation_id, "request", total_started, &error);
                return Err(error);
            }
        };
        println!(
            "[perf] translate_request elapsed_ms={}",
            model_started.elapsed().as_millis()
        );
        translation_diagnostics::emit(
            app,
            operation_id,
            "request",
            "completed",
            total_started.elapsed().as_millis() as u64,
            DiagnosticMetadata {
                text_length: Some(text_length),
                trace_id: translated.trace_id.clone(),
                model: translated.model.clone(),
                ..Default::default()
            },
        );

        // 4. 粘贴翻译结果
        let paste_started = Instant::now();
        #[cfg(target_os = "windows")]
        {
            if let Err(error) = wait_for_windows_modifiers_release()
                .await
                .and_then(|_| ensure_windows_target(target_window))
            {
                emit_stage_failure(app, operation_id, "paste", total_started, &error);
                return Err(error);
            }
        }
        if let Err(error) = app.clipboard().write_text(&translated.text) {
            let error = anyhow!(error);
            emit_stage_failure(app, operation_id, "paste", total_started, &error);
            return Err(error);
        }
        owned_clipboard = Some(translated.text.clone());
        if let Err(error) = simulate_keyboard_shortcuts(
            app,
            paste_shortcut_keys(settings.daily_mode),
            Some(&translated.text),
        )
        .await
        {
            emit_stage_failure(app, operation_id, "paste", total_started, &error);
            return Err(error);
        }
        println!(
            "[perf] paste_phase elapsed_ms={}",
            paste_started.elapsed().as_millis()
        );
        println!(
            "[perf] pipeline_total elapsed_ms={}",
            total_started.elapsed().as_millis()
        );
        translation_diagnostics::emit(
            app,
            operation_id,
            "pipeline",
            "succeeded",
            total_started.elapsed().as_millis() as u64,
            DiagnosticMetadata {
                text_length: Some(text_length),
                trace_id: translated.trace_id,
                model: translated.model,
                ..Default::default()
            },
        );

        Ok(())
    }
    .await;

    finish_clipboard_operation(app, &clipboard_backup, &owned_clipboard).await;
    result
}

pub async fn has_text_selection(app: &AppHandle) -> Result<bool> {
    let _clipboard_guard = CLIPBOARD_OPERATION
        .try_lock()
        .map_err(|_| anyhow!("文本操作进行中，请稍后重试"))?;
    let clipboard_backup = app.clipboard().read_text().ok();
    let clipboard_probe = build_clipboard_probe();
    app.clipboard().write_text(&clipboard_probe)?;
    let mut owned_clipboard = Some(clipboard_probe.clone());

    let result = async {
        simulate_keyboard_shortcuts(app, copy_shortcut_keys(true), None).await?;
        let selected_text = read_copied_text(app, &clipboard_probe).await?;
        owned_clipboard = Some(selected_text.clone());
        Ok(is_meaningful_clipboard_text(
            &selected_text,
            &clipboard_probe,
        ))
    }
    .await;

    restore_clipboard(app, &clipboard_backup, &owned_clipboard);
    result
}

async fn simulate_keyboard_shortcuts(
    app: &AppHandle,
    keys: &[&str],
    expected_clipboard: Option<&str>,
) -> Result<()> {
    if keys.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        ensure_expected_clipboard(app, expected_clipboard)?;
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
        let target_window = windows_foreground_window();
        wait_for_windows_modifiers_release().await?;
        for key in keys {
            crate::windows_input::send_control_shortcut(key, || {
                ensure_windows_target(target_window)?;
                ensure_expected_clipboard(app, expected_clipboard)
            })
            .await?;
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

    wait_for_modifiers_release(
        || {
            [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN]
                .into_iter()
                .any(|key| unsafe { GetAsyncKeyState(key as i32) } < 0)
        },
        Duration::from_millis(MODIFIER_RELEASE_TIMEOUT_MS),
    )
    .await
}

#[cfg(any(target_os = "windows", test))]
async fn wait_for_modifiers_release(
    mut any_down: impl FnMut() -> bool,
    timeout: Duration,
) -> Result<()> {
    let deadline = Instant::now() + timeout;
    while any_down() {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(anyhow!("快捷键仍处于按下状态，请松开组合键后重试"));
        }
        sleep(remaining.min(Duration::from_millis(10))).await;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_foreground_window() -> usize {
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow() as usize }
}

#[cfg(target_os = "windows")]
fn ensure_windows_target(expected: usize) -> Result<()> {
    ensure_same_target(expected, windows_foreground_window())
}

#[cfg(any(target_os = "windows", test))]
fn ensure_same_target(expected: usize, current: usize) -> Result<()> {
    if expected == 0 || current != expected {
        return Err(anyhow!("目标窗口已切换，已停止替换；请返回原窗口后重试"));
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
    let _clipboard_guard = CLIPBOARD_OPERATION
        .try_lock()
        .map_err(|_| anyhow!("文本操作进行中，请稍后重试"))?;
    let clipboard_backup = app.clipboard().read_text().ok();
    let mut owned_clipboard = None;
    let result = async {
        let settings = crate::store::get_settings(app)?;
        if !settings.app_enabled {
            println!("应用已禁用，跳过常用语发送");
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            let target_window = windows_foreground_window();
            wait_for_windows_modifiers_release().await?;
            ensure_windows_target(target_window)?;
        }
        // 将短语写入剪贴板
        app.clipboard().write_text(phrase)?;
        owned_clipboard = Some(phrase.to_string());

        // 模拟粘贴操作
        simulate_keyboard_shortcuts(app, &["v"], Some(phrase)).await?;

        Ok(())
    }
    .await;

    finish_clipboard_operation(app, &clipboard_backup, &owned_clipboard).await;
    result
}

fn ensure_expected_clipboard(app: &AppHandle, expected: Option<&str>) -> Result<()> {
    if let Some(expected) = expected {
        ensure_paste_text(&app.clipboard().read_text()?, expected)?;
    }
    Ok(())
}

fn ensure_paste_text(current: &str, expected: &str) -> Result<()> {
    if current != expected {
        return Err(anyhow!("剪贴板内容已变化，已停止粘贴；请重新触发翻译"));
    }
    Ok(())
}

fn restore_clipboard(app: &AppHandle, backup: &Option<String>, owned: &Option<String>) {
    if let Err(error) = restore_owned_clipboard(
        backup.as_deref(),
        owned.as_deref(),
        || app.clipboard().read_text(),
        |text| app.clipboard().write_text(text),
    ) {
        eprintln!("恢复剪贴板失败: {}", error);
    }
}

fn restore_owned_clipboard<E>(
    backup: Option<&str>,
    owned: Option<&str>,
    read: impl FnOnce() -> std::result::Result<String, E>,
    write: impl FnOnce(&str) -> std::result::Result<(), E>,
) -> std::result::Result<(), E> {
    if let (Some(content), Some(expected)) = (backup, owned) {
        // A read failure or external clipboard change must never trigger a write.
        if read()?.as_str() == expected {
            write(content)?;
        }
    }
    Ok(())
}

async fn read_copied_text(app: &AppHandle, clipboard_probe: &str) -> Result<String> {
    poll_copied_text(
        || app.clipboard().read_text(),
        clipboard_probe,
        Duration::from_millis(COPY_SETTLE_TIMEOUT_MS),
    )
    .await
}

async fn poll_copied_text<E: std::fmt::Display>(
    mut read: impl FnMut() -> std::result::Result<String, E>,
    clipboard_probe: &str,
    timeout: Duration,
) -> Result<String> {
    let deadline = Instant::now() + timeout;
    loop {
        let read_error = match read() {
            Ok(current) if is_meaningful_clipboard_text(&current, clipboard_probe) => {
                return Ok(current)
            }
            Ok(_) => None,
            Err(error) => Some(error.to_string()),
        };
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(match read_error {
                Some(error) => anyhow!("读取剪贴板失败，可能正被其他程序占用，请重试：{error}"),
                None => anyhow!(
                    "目标应用未复制可翻译文本；请确认输入框已聚焦，日常模式下需先选中文本后重试"
                ),
            });
        }
        sleep(remaining.min(Duration::from_millis(COPY_SETTLE_DELAY_MS))).await;
    }
}

async fn finish_clipboard_operation(
    app: &AppHandle,
    backup: &Option<String>,
    owned: &Option<String>,
) {
    if owned.is_some() {
        // Await this delay while holding the operation lock. An old restore must
        // never race a new translation or phrase's copy/paste.
        sleep(Duration::from_millis(CLIPBOARD_RESTORE_DELAY_MS)).await;
        restore_clipboard(app, backup, owned);
    }
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
    fn clipboard_restore_preserves_new_user_copy_and_untouched_failures() {
        use std::cell::RefCell;
        let clipboard = RefCell::new("translation".to_string());
        let restore = |owned| {
            restore_owned_clipboard::<&str>(
                Some("backup"),
                owned,
                || Ok(clipboard.borrow().clone()),
                |text| {
                    *clipboard.borrow_mut() = text.to_string();
                    Ok(())
                },
            )
        };
        restore(Some("translation")).unwrap();
        assert_eq!(*clipboard.borrow(), "backup");
        *clipboard.borrow_mut() = "new user copy".to_string();
        restore(Some("translation")).unwrap();
        assert_eq!(*clipboard.borrow(), "new user copy");
        restore(None).unwrap();
        assert_eq!(*clipboard.borrow(), "new user copy");
        let result = restore_owned_clipboard(
            Some("backup"),
            Some("probe"),
            || Err("clipboard locked"),
            |_| -> Result<(), &str> { panic!("must not write") },
        );
        assert_eq!(result, Err("clipboard locked"));
    }

    #[test]
    fn clipboard_operations_exclude_phrases_and_selection_until_guard_drops() {
        let guard = CLIPBOARD_OPERATION.try_lock().unwrap();
        assert!(CLIPBOARD_OPERATION.try_lock().is_err());
        tauri::async_runtime::block_on(async { sleep(Duration::from_millis(5)).await });
        assert!(CLIPBOARD_OPERATION.try_lock().is_err());
        drop(guard);
        assert!(CLIPBOARD_OPERATION.try_lock().is_ok());
    }

    #[test]
    fn copy_poll_recovers_from_transient_busy_clipboard() {
        tauri::async_runtime::block_on(async {
            let mut reads = vec![
                Ok("copied text".to_string()),
                Ok("probe".to_string()),
                Err("busy"),
            ];
            let text =
                poll_copied_text(|| reads.pop().unwrap(), "probe", Duration::from_millis(200))
                    .await
                    .unwrap();
            assert_eq!(text, "copied text");
            let error = poll_copied_text(|| Err::<String, _>("busy"), "probe", Duration::ZERO)
                .await
                .unwrap_err();
            assert!(error.to_string().contains("busy"));
            let error = poll_copied_text(
                || Ok::<_, &str>("probe".to_string()),
                "probe",
                Duration::ZERO,
            )
            .await
            .unwrap_err();
            assert!(error.to_string().contains("输入框"));
        });
    }

    #[test]
    fn modifier_wait_handles_release_and_stops_at_deadline() {
        tauri::async_runtime::block_on(async {
            let mut states = vec![false, true, true];
            wait_for_modifiers_release(|| states.pop().unwrap(), Duration::from_millis(200))
                .await
                .unwrap();
            assert!(
                wait_for_modifiers_release(|| true, Duration::from_millis(20))
                    .await
                    .is_err()
            );
            wait_for_modifiers_release(|| false, Duration::ZERO)
                .await
                .unwrap();
        });
    }

    #[test]
    fn paste_aborts_when_clipboard_changes_during_wait_or_retry() {
        ensure_paste_text("translation", "translation").unwrap();
        assert!(ensure_paste_text("new user copy", "translation").is_err());
        assert!(ensure_paste_text("", "translation").is_err());
    }

    #[test]
    fn paste_rejects_changed_or_missing_foreground_window() {
        ensure_same_target(12, 12).unwrap();
        assert!(ensure_same_target(12, 13).is_err());
        assert!(ensure_same_target(12, 0).is_err());
        assert!(ensure_same_target(0, 0).is_err());
    }

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
        let wait_budget_ms = std::hint::black_box(COPY_SETTLE_TIMEOUT_MS);
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
        let wait_budget_ms = std::hint::black_box(MODIFIER_RELEASE_TIMEOUT_MS);
        assert!((1500..=2500).contains(&wait_budget_ms));
    }
}
