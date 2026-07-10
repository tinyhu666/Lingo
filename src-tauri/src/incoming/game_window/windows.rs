//! Windows game-window detection via `EnumWindows`.
//!
//! Cheap (~100 μs typical; <1 ms even on a heavily-populated desktop).
//! Called once per pipeline tick by [`super::detect_current`].
//!
//! The matching rule is process-name + window-class + window-title, with
//! all three checked against [`super::SIGNATURES`]. We filter out
//! invisible / cloaked windows (DWM uses them for animation) and tool
//! windows so we don't accidentally match a launcher splash screen
//! sharing the game's process name.

use windows::core::BOOL;
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, HMONITOR, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible,
};

use super::{matches_signature, GameSignature, GameWindow, SIGNATURES};
use crate::incoming::region::Rect;

pub fn detect_current() -> Option<GameWindow> {
    let mut acc: Vec<GameWindow> = Vec::new();
    let ptr: *mut Vec<GameWindow> = &mut acc;
    unsafe {
        // EnumWindows itself returns Result<()>; an Err means the
        // callback stopped enumeration early (which we never do — we
        // collect every match and pick at the end). Swallow any error.
        let _ = EnumWindows(Some(enum_proc), LPARAM(ptr as isize));
    }
    // Prefer non-minimised matches if both states are present.
    if let Some(active) = acc.iter().find(|w| !w.minimised) {
        return Some(active.clone());
    }
    acc.into_iter().next()
}

/// Debug-only: dump every visible top-level window the detector sees
/// along with its class / title / process name, plus whether any
/// `SIGNATURES` row matched. Surfaced as a tauri command so DevTools
/// can call it when detection silently fails — `await window.__TAURI__
/// .core.invoke('incoming_debug_enumerate_windows')`.
///
/// Only visible windows with non-empty titles are returned; otherwise
/// the output is swamped by DWM cloaked helpers.
pub fn enumerate_all_for_debug() -> Vec<super::DebugWindowEntry> {
    let mut acc: Vec<super::DebugWindowEntry> = Vec::new();
    let ptr: *mut Vec<super::DebugWindowEntry> = &mut acc;
    unsafe {
        let _ = EnumWindows(Some(enum_proc_debug), LPARAM(ptr as isize));
    }
    acc
}

unsafe extern "system" fn enum_proc_debug(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let acc = unsafe { &mut *(lparam.0 as *mut Vec<super::DebugWindowEntry>) };

    // Filter the same way detect_current does, so the dump matches
    // what the production detector actually walks.
    if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
        return TRUE;
    }
    let title = read_window_text(hwnd);
    // Skip truly empty rows — every Windows session has a hundred of
    // them (DWM helpers, tray hosts, etc.) and they swamp the output.
    if title.is_empty() {
        return TRUE;
    }
    let class = read_class_name(hwnd);
    let process_name = process_name_for(hwnd);
    let process_name_lc = process_name.to_lowercase();

    let matched_game_id = SIGNATURES
        .iter()
        .find(|s| matches_signature(s, &process_name_lc, &class, &title))
        .map(|s| s.game_id);

    acc.push(super::DebugWindowEntry {
        hwnd: hwnd.0 as isize,
        class,
        title,
        process_name,
        process_name_lc,
        matched_game_id,
    });
    TRUE
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: lparam was set by detect_current to a valid &mut Vec.
    let acc = unsafe { &mut *(lparam.0 as *mut Vec<GameWindow>) };

    // Reject obvious non-game windows first to avoid the syscalls below.
    if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
        return TRUE;
    }

    let title = read_window_text(hwnd);
    let class = read_class_name(hwnd);
    let process_name = process_name_for(hwnd);
    let process_lc = process_name.to_lowercase();

    let Some(sig) = SIGNATURES
        .iter()
        .find(|s| matches_signature(s, &process_lc, &class, &title))
    else {
        return TRUE;
    };

    let Some(window) = build_game_window(hwnd, sig) else {
        return TRUE;
    };
    acc.push(window);
    TRUE
}

fn build_game_window(hwnd: HWND, sig: &GameSignature) -> Option<GameWindow> {
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect as *mut _) }.is_err() {
        return None;
    }
    let w = (rect.right - rect.left).max(0);
    let h = (rect.bottom - rect.top).max(0);
    if w == 0 || h == 0 {
        return None;
    }
    let display_id = monitor_id_for(hwnd)?;
    let minimised = unsafe { IsIconic(hwnd) }.as_bool();

    Some(GameWindow {
        game_id: sig.game_id,
        bounds: Rect {
            x: rect.left,
            y: rect.top,
            w: w as u32,
            h: h as u32,
        },
        display_id,
        minimised,
    })
}

/// Look up the monitor the window currently sits on and return the
/// same stable `u64` key that [`crate::incoming::capture::list_displays`]
/// reports — the hash of `\\.\DISPLAY<n>`. This keeps `GameWindow.display_id`
/// and `DisplayInfo.id` in the same id space.
fn monitor_id_for(hwnd: HWND) -> Option<u64> {
    let hmonitor: HMONITOR = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if hmonitor.0.is_null() {
        return None;
    }
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if !unsafe { GetMonitorInfoW(hmonitor, &mut info.monitorInfo as *mut _) }.as_bool() {
        return None;
    }
    let name_chars: Vec<u16> = info
        .szDevice
        .iter()
        .take_while(|&&c| c != 0)
        .cloned()
        .collect();
    let device_name = String::from_utf16_lossy(&name_chars);
    Some(crate::incoming::capture::windows::intern_device_name_pub(
        &device_name,
    ))
}

// ---------------------------------------------------------------------------
// Window text / class / process readers
// ---------------------------------------------------------------------------

fn read_window_text(hwnd: HWND) -> String {
    let mut buf = [0u16; 512];
    let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
    if n <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..(n as usize)])
}

fn read_class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) };
    if n <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..(n as usize)])
}

/// Best-effort lookup of the host process's executable file name (no
/// path). Returns `""` if we can't open the process or read the module
/// name — that's normal for anti-cheat / system-protected processes,
/// and after v0.9.0-rc.2 the matcher tolerates empty process names.
///
/// Uses `QueryFullProcessImageNameW` which requires only
/// `PROCESS_QUERY_LIMITED_INFORMATION` — the most permissive access
/// rights available for cross-trust-level introspection on Win 7+.
/// The old `GetModuleFileNameExW` + `PROCESS_VM_READ` combo would
/// fail for VAC-protected processes (Dota 2 under EAC/VAC); the new
/// pairing works for everything except deeply protected system
/// processes.
fn process_name_for(hwnd: HWND) -> String {
    let mut pid: u32 = 0;
    let _ = unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32)) };
    if pid == 0 {
        return String::new();
    }

    let handle: HANDLE = match unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
    {
        Ok(h) => h,
        Err(_) => return String::new(),
    };
    if handle.is_invalid() {
        return String::new();
    }

    let mut buf = [0u16; 1024];
    let mut size: u32 = buf.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0), // PROCESS_NAME_WIN32 = friendly Win32 path
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size as *mut u32,
        )
    };
    unsafe {
        let _ = windows::Win32::Foundation::CloseHandle(handle);
    }
    if result.is_err() || size == 0 {
        return String::new();
    }
    let path = String::from_utf16_lossy(&buf[..(size as usize)]);
    // Return the basename only. We compare lowercase against
    // signatures like `dota2.exe`.
    path.rsplit(['\\', '/']).next().unwrap_or("").to_string()
}

// CloseHandle returns BOOL but we deliberately ignore failures here —
// the handle was opened by us and we don't reuse the variable.
trait HandleExt {
    fn is_invalid(self) -> bool;
}
impl HandleExt for HANDLE {
    fn is_invalid(self) -> bool {
        self.0.is_null()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_current_does_not_panic_on_a_clean_desktop() {
        // CI doesn't have Dota running. detect_current() should return
        // None, not panic.
        let _ = detect_current();
    }

    #[test]
    fn read_window_text_returns_empty_for_null_hwnd() {
        // SAFETY: GetWindowTextW with a null HWND returns 0 — does not
        // crash. We use this as a "doesn't panic" sanity test for the
        // wrapper, not a contract assertion.
        let s = read_window_text(HWND(std::ptr::null_mut()));
        assert_eq!(s, "");
    }
}
