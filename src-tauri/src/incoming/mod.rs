//! Incoming-chat translation subsystem (v0.7.0 work in progress).
//!
//! Pipeline (final shape):
//!
//! ```text
//!   ┌─────────┐   ┌─────┐   ┌─────────┐   ┌──────────────┐   ┌────────┐
//!   │ Capture │ → │ OCR │ → │ Tracker │ → │ TranslateProxy│→ │Overlay │
//!   │ (1-2Hz) │   │     │   │ (dedup) │   │   (fast lane) │   │ window │
//!   └─────────┘   └─────┘   └─────────┘   └──────────────┘   └────────┘
//! ```
//!
//! Current state: **scaffolding only**. The traits + types are real and shape
//! the architecture, but the platform-specific `capture` and `ocr`
//! implementations return [`CaptureError::Unimplemented`] /
//! [`OcrError::Unimplemented`].
//!
//! Reference implementations:
//! - macOS Apple Vision OCR — see `spikes/ocr-vision/spike.swift` and the
//!   accompanying `SPIKE_RESULTS.md`. The Rust port will live in
//!   `ocr::macos` once `objc2-vision` is wired in.
//! - Overlay visual variants — see `spikes/overlay-design/index.html`.
//!
//! The [`tracker`] module is already fully implemented and unit tested; it is
//! the only platform-agnostic part of the pipeline.

pub mod capture;
pub mod ocr;
pub mod pipeline;
pub mod region;
pub mod tracker;

pub use capture::{CaptureError, CaptureSource, OcrFrame, PixelFormat};
pub use ocr::{OcrEngine, OcrError, OcrOptions, RecognitionLevel, TextLine};
pub use pipeline::{IncomingPipeline, StartOptions};
pub use region::{ChatRegion, Rect};
pub use tracker::{LineTracker, NewMessage};

use serde::{Deserialize, Serialize};

/// Macro state the front-end needs to render the home status card and the
/// settings page without launching the pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingStatus {
    pub enabled: bool,
    pub active: bool,
    pub permission: PermissionState,
    pub current_game_scene: Option<String>,
    pub has_region_for_current_scene: bool,
    pub capture_rate_hz: f32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    /// Querying the OS hasn't completed yet (or no answer received).
    Unknown,
    /// User has granted the OS-level permission required to capture pixels.
    Granted,
    /// User denied or revoked; the front-end should show a "open system
    /// settings" CTA.
    Denied,
    /// Platform doesn't require an explicit permission for capture
    /// (e.g. Windows.Graphics.Capture on Windows 10+).
    NotApplicable,
}

/// Returns the platform's screen-capture permission status. macOS uses the
/// CoreGraphics preflight API in a future revision; for now this is a
/// scaffold value matching the eventual return type.
pub fn current_permission_state() -> PermissionState {
    #[cfg(target_os = "macos")]
    {
        // TODO(v0.7.0-rc.2): call CGPreflightScreenCaptureAccess via objc2.
        PermissionState::Unknown
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

/// Payload for the `incoming:translation` Tauri event consumed by the
/// overlay window. Mirrors what the v0.7.0-rc.2 real pipeline will emit;
/// for now it carries demo content tagged with `demo: true`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingTranslation {
    pub id: String,
    pub sender: Option<String>,
    pub scope: Option<MessageScope>,
    pub source_text: String,
    pub translated_text: String,
    pub source_lang: Option<String>,
    pub target_lang: Option<String>,
    pub timestamp_ms: u64,
    /// `true` when this event was emitted by the demo / mock emitter
    /// instead of a real OCR -> translation pass.
    pub demo: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageScope {
    Team,
    All,
}

/// Display metadata as exposed to the front-end during region calibration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub id: u64,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

/// Returns the platform's display list. Stub returns a single synthetic
/// "primary" entry so the front-end calibration UI can render without
/// crashing while the real implementation is in flight.
pub fn list_displays_stub() -> Vec<DisplayInfo> {
    vec![DisplayInfo {
        id: 0,
        name: "Primary Display".to_string(),
        width: 1920,
        height: 1080,
        scale_factor: 1.0,
        is_primary: true,
    }]
}
