//! OCR engine abstraction.
//!
//! Production implementations:
//! - macOS: `VNRecognizeTextRequest` via `objc2-vision`. Validated by the
//!   Swift spike in `spikes/ocr-vision/` — see `SPIKE_RESULTS.md` for
//!   the configuration that survived testing.
//! - Windows: `Windows.Media.Ocr.OcrEngine` via the `windows` crate.
//!
//! Spike findings that drive the defaults below:
//! - `auto_detect_language = true` beats explicit language lists on
//!   multilingual chat (Russian was 0% accurate with explicit list,
//!   100% accurate with auto-detect).
//! - `usesLanguageCorrection = false` because game chat is full of
//!   slang and abbreviations the corrector mishandles.

use crate::incoming::capture::OcrFrame;
use crate::incoming::region::Rect;
use std::fmt;

#[derive(Debug, Clone)]
pub struct TextLine {
    pub text: String,
    pub confidence: f32,
    /// Bounding box in pixel coordinates of the captured frame.
    pub bbox: Rect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecognitionLevel {
    Accurate,
    Fast,
}

#[derive(Debug, Clone)]
pub struct OcrOptions {
    pub level: RecognitionLevel,
    pub auto_detect_language: bool,
    /// Used only when `auto_detect_language` is false. BCP-47 codes.
    pub languages: Vec<String>,
    pub uses_language_correction: bool,
}

impl Default for OcrOptions {
    /// Production defaults, derived from spike measurements. See
    /// `spikes/ocr-vision/SPIKE_RESULTS.md`.
    fn default() -> Self {
        Self {
            level: RecognitionLevel::Accurate,
            auto_detect_language: true,
            languages: Vec::new(),
            uses_language_correction: false,
        }
    }
}

#[derive(Debug)]
pub enum OcrError {
    EngineInit(String),
    InvalidFrame(String),
    RecognitionFailed(String),
    Unimplemented,
}

impl fmt::Display for OcrError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EngineInit(m) => write!(f, "OCR engine init failed: {m}"),
            Self::InvalidFrame(m) => write!(f, "invalid OCR frame: {m}"),
            Self::RecognitionFailed(m) => write!(f, "OCR recognition failed: {m}"),
            Self::Unimplemented => write!(f, "OCR engine not yet implemented"),
        }
    }
}

impl std::error::Error for OcrError {}

pub trait OcrEngine: Send + Sync {
    fn recognize(&self, frame: &OcrFrame, opts: &OcrOptions) -> Result<Vec<TextLine>, OcrError>;

    /// Recognize a frame with multilingual recovery.
    ///
    /// On macOS, the Apple Vision impl runs two passes (auto-detect plus
    /// an explicit `ru-RU` pass) and merges them — necessary because the
    /// auto-detector biases toward the dominant script in mixed frames
    /// and silently mangles minority languages. See
    /// [`spikes/ocr-vision/SPIKE_RESULTS.md`] for the measurement that
    /// motivates this.
    ///
    /// The default implementation just calls [`recognize`] once. Platform
    /// impls override when they have something useful to add.
    fn recognize_multilingual(
        &self,
        frame: &OcrFrame,
        opts: &OcrOptions,
    ) -> Result<Vec<TextLine>, OcrError> {
        self.recognize(frame, opts)
    }
}

pub fn default_ocr_engine() -> Result<Box<dyn OcrEngine>, OcrError> {
    #[cfg(target_os = "macos")]
    return macos::create();

    #[cfg(target_os = "windows")]
    return windows::create();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return Err(OcrError::Unimplemented);
}

// ---------------------------------------------------------------------------
// Platform impls.
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
mod windows {
    use super::*;

    /// Will wrap `Windows.Media.Ocr.OcrEngine`. Needs Spike B accuracy
    /// numbers before locking in the language-selection strategy.
    pub fn create() -> Result<Box<dyn OcrEngine>, OcrError> {
        Err(OcrError::Unimplemented)
    }
}
