//! Screen-capture permission preflight + request.
//!
//! On macOS this is the only OS-level gate between Lingo's pipeline and
//! the user's chat panel. `CGPreflightScreenCaptureAccess` is read-only
//! (won't prompt) and `CGRequestScreenCaptureAccess` triggers the system
//! Screen Recording prompt the first time it's called for the app's
//! bundle ID. Both functions live in CoreGraphics.framework since
//! macOS 10.15.
//!
//! Resolution uses `dlsym` instead of a hard `extern "C"` import so that
//! a future LingoSlim build on macOS 10.13/10.14 (which doesn't have the
//! symbols) still loads — those callers just see `Unknown` permission
//! state.
//!
//! On Windows the OS-level capture API used in v0.7.0-rc.2
//! (`Windows.Graphics.Capture`) doesn't require a permission preflight,
//! so we report `NotApplicable` immediately.

use super::PermissionState;

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::CStr;
    use std::os::raw::{c_char, c_int, c_void};
    use std::sync::OnceLock;

    type CGAccessFn = unsafe extern "C" fn() -> bool;

    const RTLD_LAZY: c_int = 1;
    const CG_FRAMEWORK: &CStr =
        c"/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";

    extern "C" {
        fn dlopen(filename: *const c_char, flag: c_int) -> *mut c_void;
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }

    struct ResolvedSymbols {
        preflight: Option<CGAccessFn>,
        request: Option<CGAccessFn>,
    }

    /// We resolve once and cache so repeated permission checks stay cheap.
    fn symbols() -> &'static ResolvedSymbols {
        static SYMBOLS: OnceLock<ResolvedSymbols> = OnceLock::new();
        SYMBOLS.get_or_init(|| unsafe {
            let handle = dlopen(CG_FRAMEWORK.as_ptr(), RTLD_LAZY);
            if handle.is_null() {
                return ResolvedSymbols {
                    preflight: None,
                    request: None,
                };
            }
            ResolvedSymbols {
                preflight: resolve(handle, c"CGPreflightScreenCaptureAccess"),
                request: resolve(handle, c"CGRequestScreenCaptureAccess"),
            }
        })
    }

    unsafe fn resolve(handle: *mut c_void, name: &CStr) -> Option<CGAccessFn> {
        let sym = dlsym(handle, name.as_ptr());
        if sym.is_null() {
            None
        } else {
            Some(std::mem::transmute::<*mut c_void, CGAccessFn>(sym))
        }
    }

    /// Returns the current Screen Recording permission state without
    /// triggering the system prompt.
    pub fn preflight() -> Option<bool> {
        let f = symbols().preflight?;
        Some(unsafe { f() })
    }

    /// Triggers the system prompt the first time it's called. Returns the
    /// permission state immediately afterwards; on the first ever call
    /// macOS returns `false` because the user hasn't decided yet, then
    /// changes the answer asynchronously. The app typically needs to
    /// restart for a freshly granted permission to apply to the running
    /// process.
    pub fn request() -> Option<bool> {
        let f = symbols().request?;
        Some(unsafe { f() })
    }
}

pub fn current_state() -> PermissionState {
    #[cfg(target_os = "macos")]
    {
        match macos::preflight() {
            Some(true) => PermissionState::Granted,
            Some(false) => PermissionState::Denied,
            None => PermissionState::Unknown,
        }
    }

    #[cfg(target_os = "windows")]
    {
        PermissionState::NotApplicable
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        PermissionState::Unknown
    }
}

/// Triggers the OS permission prompt where applicable. Returns the
/// post-prompt state — note that macOS reports `false` until the user
/// accepts, so callers should poll `current_state()` rather than rely
/// on the immediate return value.
pub fn request() -> PermissionState {
    #[cfg(target_os = "macos")]
    {
        match macos::request() {
            Some(true) => PermissionState::Granted,
            Some(false) => PermissionState::Denied,
            None => PermissionState::Unknown,
        }
    }

    #[cfg(target_os = "windows")]
    {
        PermissionState::NotApplicable
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        PermissionState::Unknown
    }
}
