//! Main loop wiring capture → OCR → tracker → translation.
//!
//! **Scaffold only.** The shape is here so other modules can refer to it,
//! but the run loop is not yet implemented. The intended production
//! behavior:
//!
//! 1. Spawn a dedicated `tauri::async_runtime` task.
//! 2. Tick at `capture_rate_hz` (default 1.5 Hz).
//! 3. Each tick: capture → perceptual-hash diff against previous frame.
//!    If unchanged, skip; otherwise OCR.
//! 4. Feed OCR output to `LineTracker::ingest`.
//! 5. For each `NewMessage`, push to translate-proxy with
//!    `direction: "incoming"` so it routes to the fast lane.
//! 6. Emit `incoming:translation` Tauri events to the overlay window.
//!
//! Lifecycle:
//! - `start()` is idempotent (re-entrant calls are no-ops).
//! - `stop()` cancels the task and clears the overlay state.
//! - Settings changes (region, rate, enabled flag) are pushed via a
//!   bounded mpsc channel so the loop reconfigures without restarting.

use crate::incoming::tracker::LineTracker;
use std::sync::Mutex;

/// Owner of the pipeline state. Wrapped in `Mutex` only because the
/// trait stubs are not yet `Send`; will become lock-free once the real
/// task-based impl lands.
pub struct IncomingPipeline {
    #[allow(dead_code)]
    tracker: Mutex<LineTracker>,
}

impl IncomingPipeline {
    pub fn new() -> Self {
        Self {
            tracker: Mutex::new(LineTracker::default()),
        }
    }
}

impl Default for IncomingPipeline {
    fn default() -> Self {
        Self::new()
    }
}
