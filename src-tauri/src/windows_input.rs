use anyhow::{anyhow, Result};
use std::{mem::size_of, ptr::null_mut, time::Duration};
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, SetLastError, HANDLE},
    Security::{
        GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation, IsValidSid,
        TokenIntegrityLevel, TokenUIAccess, TOKEN_MANDATORY_LABEL, TOKEN_QUERY,
    },
    System::Threading::{
        GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
    },
    UI::{
        Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_A, VK_C,
            VK_CONTROL, VK_V,
        },
        WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
    },
};

const MAX_ATTEMPTS: usize = 3;

fn key_code(key: &str) -> Result<u16> {
    match key {
        "a" => Ok(VK_A),
        "c" => Ok(VK_C),
        "v" => Ok(VK_V),
        _ => Err(anyhow!("不支持的 Windows 模拟按键: {key}")),
    }
}

fn input(key: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn shortcut_inputs(key: u16) -> [INPUT; 4] {
    [
        input(VK_CONTROL, 0),
        input(key, 0),
        input(key, KEYEVENTF_KEYUP),
        input(VK_CONTROL, KEYEVENTF_KEYUP),
    ]
}

// Only release keys left down by the successfully inserted prefix. Never replay
// a partially inserted shortcut: it could execute the operation twice.
fn cleanup_inputs(key: u16, sent: u32) -> Vec<INPUT> {
    match sent {
        1 | 3 => vec![input(VK_CONTROL, KEYEVENTF_KEYUP)],
        2 => vec![
            input(key, KEYEVENTF_KEYUP),
            input(VK_CONTROL, KEYEVENTF_KEYUP),
        ],
        _ => Vec::new(),
    }
}

fn should_retry(sent: u32, attempt: usize) -> bool {
    sent == 0 && attempt + 1 < MAX_ATTEMPTS
}

fn injection_error(key: &str, sent: u32, error: u32) -> anyhow::Error {
    let detail = if error == 0 {
        "Windows 未提供错误码；目标应用可能阻止模拟输入".to_string()
    } else {
        format!(
            "{}；错误码 {error}",
            std::io::Error::from_raw_os_error(error as i32)
        )
    };
    anyhow!("Windows 按键模拟失败 (Ctrl+{key}): 仅发送 {sent}/4 个事件；{detail}")
}

pub async fn send_control_shortcut(
    key: &str,
    mut validate: impl FnMut() -> Result<()>,
) -> Result<()> {
    let code = key_code(key)?;
    validate()?;
    // Store the numeric identity across await; HWND itself is not Send.
    let foreground = unsafe { GetForegroundWindow() } as usize;
    for attempt in 0..MAX_ATTEMPTS {
        if foreground == 0 || unsafe { GetForegroundWindow() } as usize != foreground {
            return Err(anyhow!("目标窗口已切换，请返回原窗口后重试"));
        }
        validate()?;
        let (sent, error) = inject_once(code);
        if sent == 4 {
            return Ok(());
        }
        // A zero return does not itself prove UIPI. Query both tokens before
        // attributing the failure to an integrity-level mismatch.
        if sent == 0 && higher_integrity_target(foreground) == Some(true) {
            return Err(anyhow!("目标应用的权限高于 Lingo，Windows 阻止模拟按键。请将目标应用按普通权限重新启动后重试；若必须使用管理员权限，请手动以相同权限重启 Lingo"));
        }
        if !should_retry(sent, attempt) {
            return Err(injection_error(key, sent, error));
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    }
    unreachable!("the final attempt always returns")
}

fn inject_once(key: u16) -> (u32, u32) {
    let inputs = shortcut_inputs(key);
    let (sent, error) = unsafe {
        SetLastError(0);
        let sent = SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            size_of::<INPUT>() as i32,
        );
        (sent, GetLastError())
    };
    let cleanup = cleanup_inputs(key, sent);
    if !cleanup.is_empty() {
        unsafe {
            SendInput(
                cleanup.len() as u32,
                cleanup.as_ptr(),
                size_of::<INPUT>() as i32,
            );
        }
    }
    (sent, error)
}

struct OwnedHandle(HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

fn process_token(process: HANDLE) -> Option<OwnedHandle> {
    let mut token = null_mut();
    if unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) } == 0 {
        None
    } else {
        Some(OwnedHandle(token))
    }
}

fn integrity_level(token: HANDLE) -> Option<u32> {
    let mut bytes = 0;
    unsafe {
        GetTokenInformation(token, TokenIntegrityLevel, null_mut(), 0, &mut bytes);
    }
    if bytes < size_of::<TOKEN_MANDATORY_LABEL>() as u32 {
        return None;
    }
    // A word buffer provides alignment for TOKEN_MANDATORY_LABEL and its SID.
    let words = (bytes as usize).div_ceil(size_of::<usize>());
    let mut buffer = vec![0usize; words];
    if unsafe {
        GetTokenInformation(
            token,
            TokenIntegrityLevel,
            buffer.as_mut_ptr().cast(),
            bytes,
            &mut bytes,
        )
    } == 0
    {
        return None;
    }
    unsafe {
        let label = &*buffer.as_ptr().cast::<TOKEN_MANDATORY_LABEL>();
        if IsValidSid(label.Label.Sid) == 0 {
            return None;
        }
        let count = *GetSidSubAuthorityCount(label.Label.Sid);
        if count == 0 {
            None
        } else {
            Some(*GetSidSubAuthority(label.Label.Sid, (count - 1) as u32))
        }
    }
}

fn higher_integrity_target(foreground: usize) -> Option<bool> {
    if unsafe { GetForegroundWindow() } as usize != foreground {
        return None;
    }
    let current = process_token(unsafe { GetCurrentProcess() })?;
    let mut ui_access = 0u32;
    let mut bytes = 0;
    if unsafe {
        GetTokenInformation(
            current.0,
            TokenUIAccess,
            (&mut ui_access as *mut u32).cast(),
            size_of::<u32>() as u32,
            &mut bytes,
        )
    } == 0
    {
        return None;
    }
    if ui_access != 0 {
        return Some(false);
    }
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(foreground as _, &mut pid);
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return None;
    }
    let process = OwnedHandle(process);
    let target = process_token(process.0)?;
    Some(integrity_level(target.0)? > integrity_level(current.0)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(inputs: &[INPUT]) -> Vec<(u16, u32)> {
        inputs
            .iter()
            .map(|i| {
                assert_eq!(i.r#type, INPUT_KEYBOARD);
                unsafe { (i.Anonymous.ki.wVk, i.Anonymous.ki.dwFlags) }
            })
            .collect()
    }

    #[test]
    fn shortcut_is_one_complete_control_batch() {
        for key in ["a", "c", "v"] {
            let code = key_code(key).unwrap();
            assert_eq!(
                keys(&shortcut_inputs(code)),
                vec![
                    (VK_CONTROL, 0),
                    (code, 0),
                    (code, KEYEVENTF_KEYUP),
                    (VK_CONTROL, KEYEVENTF_KEYUP)
                ]
            );
        }
    }

    #[test]
    fn partial_insertion_only_releases_outstanding_keys() {
        assert!(cleanup_inputs(VK_C, 0).is_empty());
        assert_eq!(
            keys(&cleanup_inputs(VK_C, 1)),
            vec![(VK_CONTROL, KEYEVENTF_KEYUP)]
        );
        assert_eq!(
            keys(&cleanup_inputs(VK_C, 2)),
            vec![(VK_C, KEYEVENTF_KEYUP), (VK_CONTROL, KEYEVENTF_KEYUP)]
        );
        assert_eq!(
            keys(&cleanup_inputs(VK_C, 3)),
            vec![(VK_CONTROL, KEYEVENTF_KEYUP)]
        );
        assert!(cleanup_inputs(VK_C, 4).is_empty());
    }

    #[test]
    fn retry_is_bounded_and_never_replays_partial_input() {
        assert!(should_retry(0, 0));
        assert!(should_retry(0, 1));
        assert!(!should_retry(0, 2));
        for sent in 1..=4 {
            assert!(!should_retry(sent, 0));
        }
    }

    #[test]
    fn errors_do_not_describe_zero_events_as_success() {
        assert!(key_code("x").is_err());
        let error = injection_error("c", 0, 0).to_string();
        assert!(error.contains("0/4"));
        assert!(error.contains("未提供错误码"));
        assert!(injection_error("c", 0, 5).to_string().contains("错误码 5"));
    }

    #[test]
    fn shortcut_future_can_run_on_the_shared_async_runtime() {
        fn assert_send<T: Send>(_: T) {}
        assert_send(send_control_shortcut("c", || Ok(())));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn validation_can_abort_before_any_windows_input_call() {
        use std::{
            future::Future,
            sync::Arc,
            task::{Context, Poll, Wake, Waker},
        };
        struct NoopWake;
        impl Wake for NoopWake {
            fn wake(self: Arc<Self>) {}
        }
        let waker = Waker::from(Arc::new(NoopWake));
        let mut context = Context::from_waker(&waker);
        let mut future = Box::pin(send_control_shortcut("v", || {
            Err(anyhow!("clipboard changed"))
        }));
        match future.as_mut().poll(&mut context) {
            Poll::Ready(Err(error)) => assert_eq!(error.to_string(), "clipboard changed"),
            _ => panic!("validation failure must abort immediately"),
        }
    }
}
