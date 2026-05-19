//! Screen-region capture abstraction.
//!
//! Production implementations:
//! - macOS: `CGDisplayCreateImageForRect` (CoreGraphics) for the captured
//!   region, then re-rendered into a premultiplied-first BGRA8 buffer via
//!   `CGBitmapContext`. The legacy CG path is intentional — it runs back
//!   to macOS 10.13 (our minimum) where `ScreenCaptureKit` (macOS 12.3+) /
//!   `SCScreenshotManager` (macOS 14+) don't exist. The user-grant flow
//!   for Screen Recording is queried via `CGPreflightScreenCaptureAccess`.
//! - Windows: `Windows.Graphics.Capture` (planned, Spike B).
//!
//! Both impls produce premultiplied BGRA8 frames; conversion to whatever
//! the OCR engine wants is the caller's job.

use crate::incoming::region::ChatRegion;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PixelFormat {
    Bgra8,
    Rgba8,
}

#[derive(Debug, Clone)]
pub struct OcrFrame {
    pub width: u32,
    pub height: u32,
    /// Bytes per row. May exceed `width * bpp` due to platform alignment.
    pub stride: u32,
    pub format: PixelFormat,
    pub data: Vec<u8>,
}

#[derive(Debug)]
pub enum CaptureError {
    PermissionDenied(String),
    DisplayNotFound(u64),
    Platform(String),
    Unimplemented,
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PermissionDenied(m) => write!(f, "screen capture permission denied: {m}"),
            Self::DisplayNotFound(id) => write!(f, "display not found: {id}"),
            Self::Platform(m) => write!(f, "platform capture error: {m}"),
            Self::Unimplemented => write!(f, "capture engine not yet implemented"),
        }
    }
}

impl std::error::Error for CaptureError {}

/// Captures pixels from a region of a single display.
///
/// Implementations must be `Send + Sync`; the pipeline shares them across
/// the capture task and any debug/preview tasks.
pub trait CaptureSource: Send + Sync {
    fn capture(&self, region: &ChatRegion) -> Result<OcrFrame, CaptureError>;
}

/// Returns the platform-appropriate `CaptureSource`. Stub during scaffolding.
pub fn default_capture_source() -> Result<Box<dyn CaptureSource>, CaptureError> {
    #[cfg(target_os = "macos")]
    return macos::create();

    #[cfg(target_os = "windows")]
    return windows::create();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err(CaptureError::Unimplemented);
}

// ---------------------------------------------------------------------------
// Platform impls.
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
mod windows {
    use super::*;

    pub fn create() -> Result<Box<dyn CaptureSource>, CaptureError> {
        Err(CaptureError::Unimplemented)
    }
}

/// Platform-specific permission state for Screen Recording.
#[cfg(target_os = "macos")]
pub use macos::{list_displays, permission_state, request_permission};

#[cfg(not(target_os = "macos"))]
pub fn permission_state() -> crate::incoming::PermissionState {
    #[cfg(target_os = "windows")]
    {
        crate::incoming::PermissionState::NotApplicable
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        crate::incoming::PermissionState::Unknown
    }
}

#[cfg(not(target_os = "macos"))]
pub fn request_permission() -> crate::incoming::PermissionState {
    permission_state()
}

#[cfg(not(target_os = "macos"))]
pub fn list_displays() -> Vec<crate::incoming::DisplayInfo> {
    crate::incoming::list_displays_stub()
}
