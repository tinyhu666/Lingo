//! Screen-region capture abstraction.
//!
//! Production implementations:
//! - macOS: `ScreenCaptureKit` via the `screencapturekit` crate. Requires
//!   user-granted Screen Recording permission. First-launch flow asks
//!   politely; status is queryable via `CGPreflightScreenCaptureAccess`.
//! - Windows: `Windows.Graphics.Capture` via the `windows-capture` crate.
//!   No UAC prompt required on Windows 10 1903+.
//!
//! Both impls produce premultiplied BGRA8 frames; conversion to whatever the
//! OCR engine wants is the caller's job.

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
// Platform-specific stubs. Each module will grow into a real implementation
// in v0.7.0-rc.2. Until then they return Unimplemented so the surface
// compiles on both platforms.
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod macos {
    use super::*;

    pub fn create() -> Result<Box<dyn CaptureSource>, CaptureError> {
        Err(CaptureError::Unimplemented)
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;

    pub fn create() -> Result<Box<dyn CaptureSource>, CaptureError> {
        Err(CaptureError::Unimplemented)
    }
}
