//! Display + region geometry for the incoming-chat pipeline.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// A captured region tied to a specific display.
///
/// `display_id` is a platform-specific opaque identifier:
/// - macOS: `CGDirectDisplayID` (u32 widened to u64).
/// - Windows: an interned key over `HMONITOR` (handles aren't stable across
///   reboots, so the front-end resolves them to a stable key on each launch).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatRegion {
    pub display_id: u64,
    pub bounds: Rect,
    /// Hint to the OCR engine. With `auto_detect_language` on (production
    /// default per `spike.swift`), this list is informational only and may
    /// be empty.
    #[serde(default)]
    pub languages: Vec<String>,
}
