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
pub use pipeline::IncomingPipeline;
pub use region::{ChatRegion, Rect};
pub use tracker::{LineTracker, NewMessage};
