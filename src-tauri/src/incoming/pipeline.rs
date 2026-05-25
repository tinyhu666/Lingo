//! capture → OCR → tracker → translation loop.
//!
//! The real pipeline. Each tick:
//!
//! 1. Read fresh settings (so the user's region/rate/scene/target-lang
//!    edits land on the next frame, not the next restart).
//! 2. Check Screen Recording permission. If denied / unknown → emit
//!    `incoming:permission_required` and back off.
//! 3. Look up the chat region for the current `game_scene`. If unset
//!    → emit `incoming:region_required` and back off.
//! 4. Capture the region via `CaptureSource::capture`.
//! 5. OCR via `OcrEngine::recognize_multilingual` (the macOS impl runs a
//!    two-pass auto-detect + ru-RU merge, see `incoming/ocr/macos.rs`).
//! 6. Run the new lines through `LineTracker` to dedupe against the last
//!    45 s of history.
//! 7. For each [`NewMessage`], spawn a fire-and-forget translation task
//!    that POSTs to translate-proxy with `direction: "incoming"` and
//!    emits `incoming:translation` when the response lands. Translation
//!    latency does NOT block the next capture tick.
//!
//! Errors at any stage are logged + (where useful) emitted as
//! `incoming:status_note` / `incoming:capture_error`, but never kill the
//! loop. The user can recover by fixing the underlying cause (granting
//! permission, calibrating a region, fixing network) without restarting.

use crate::ai_translator::translate_incoming;
use crate::incoming::capture::{default_capture_source, CaptureSource};
use crate::incoming::ocr::{default_ocr_engine, OcrEngine, OcrOptions};
use crate::incoming::tracker::{LineTracker, NewMessage};
use crate::incoming::{IncomingTranslation, PermissionState};
use crate::store;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Semaphore};

const MIN_TICK_MS: u64 = 200;
const MAX_TICK_MS: u64 = 4_000;
/// When permission / region / capture are unavailable we slow the loop
/// down to avoid spamming logs while still recovering quickly when the
/// blocking condition lifts.
const BACKOFF_TICK_MS: u64 = 2_500;
/// Cap on in-flight translate-proxy POSTs. The pipeline fires translation
/// requests off as detached tokio tasks so the OCR tick keeps cadence; this
/// semaphore prevents an unresponsive proxy from causing requests to pile
/// up indefinitely (~10s timeout × 1.5 Hz × N users = a lot of memory).
const MAX_CONCURRENT_TRANSLATES: usize = 4;

#[derive(Debug, Clone, Serialize)]
pub struct StartOptions {
    pub capture_rate_hz: f32,
    pub game_scene: String,
    pub target_lang: String,
    pub show_original: bool,
}

pub struct IncomingPipeline {
    inner: Mutex<PipelineState>,
    /// Lives outside the mutex so the run loop itself can clear it on any
    /// exit path (including the fatal-early-return paths). Without this,
    /// a capture/OCR init failure left `running=true` in the inner state
    /// and the user couldn't restart without explicitly toggling off
    /// first.
    running: Arc<AtomicBool>,
}

impl Default for IncomingPipeline {
    fn default() -> Self {
        Self {
            inner: Mutex::new(PipelineState::default()),
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Default)]
struct PipelineState {
    handle: Option<JoinHandle<()>>,
    cancel: Option<oneshot::Sender<()>>,
}

impl IncomingPipeline {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns true if the pipeline's background task is currently running.
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Acquire)
    }

    /// Spawns the run loop. Defensively aborts any lingering prior handle
    /// (which can happen if the user mashes the toggle within a frame)
    /// before swapping in a new one. Idempotent when already running.
    pub fn start(&self, app: AppHandle, _opts: StartOptions) -> Result<(), String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|e| format!("pipeline mutex poisoned: {e}"))?;
        if self.running.load(Ordering::Acquire) {
            return Ok(());
        }
        // Belt-and-braces: if a previous run is still being torn down (start →
        // stop → start in quick succession), abort its task and drop its
        // cancel sender now so we don't accumulate run loops.
        if let Some(prev) = state.handle.take() {
            prev.abort();
        }
        state.cancel = None;

        let (cancel_tx, cancel_rx) = oneshot::channel();
        let running = Arc::clone(&self.running);
        running.store(true, Ordering::Release);
        let handle = tauri::async_runtime::spawn(async move {
            run_loop(app, cancel_rx).await;
            // Any exit path — clean cancel, fatal-early-return, or panic
            // unwinding through the await — flips `running` back so the
            // next start() doesn't see a stale `true`.
            running.store(false, Ordering::Release);
        });
        state.handle = Some(handle);
        state.cancel = Some(cancel_tx);
        Ok(())
    }

    /// Cancels the run loop. Safe to call when already stopped. Returns
    /// immediately; the actual task teardown happens asynchronously.
    pub fn stop(&self) {
        let (cancel, handle) = {
            let Ok(mut state) = self.inner.lock() else {
                return;
            };
            (state.cancel.take(), state.handle.take())
        };
        if let Some(tx) = cancel {
            let _ = tx.send(());
        }
        // Flag goes false here so callers reading `is_running()` see the
        // intent immediately, even before the spawned task has a chance
        // to drain. The store inside the spawn closure (above) is a
        // backstop for the early-return case.
        self.running.store(false, Ordering::Release);
        if let Some(handle) = handle {
            handle.abort();
        }
    }
}

// ---------------------------------------------------------------------------
// Run loop
// ---------------------------------------------------------------------------

async fn run_loop(app: AppHandle, mut cancel: oneshot::Receiver<()>) {
    let capture: Box<dyn CaptureSource> = match default_capture_source() {
        Ok(c) => c,
        Err(error) => {
            let _ = app.emit(
                "incoming:fatal",
                format!("capture engine unavailable: {error}"),
            );
            let _ = app.emit("incoming:stopped", ());
            return;
        }
    };
    let ocr: Box<dyn OcrEngine> = match default_ocr_engine() {
        Ok(o) => o,
        Err(error) => {
            let _ = app.emit("incoming:fatal", format!("OCR engine unavailable: {error}"));
            let _ = app.emit("incoming:stopped", ());
            return;
        }
    };

    let mut tracker = LineTracker::default();
    let id_counter = Arc::new(AtomicU64::new(1));
    // Bound translate-proxy concurrency. Each new line is translated on a
    // detached tokio task so the OCR cadence doesn't depend on proxy
    // latency; the semaphore prevents runaway queueing when the proxy
    // stalls (each acquire returns immediately under normal load).
    let translate_permits = Arc::new(Semaphore::new(MAX_CONCURRENT_TRANSLATES));

    let mut last_note: Option<&'static str> = None;
    let mut backoff_active = false;

    loop {
        // Wait for the next tick or cancel signal.
        let tick_ms = if backoff_active {
            BACKOFF_TICK_MS
        } else {
            settings_tick_ms(&app)
        };
        tokio::select! {
            biased;
            _ = &mut cancel => break,
            _ = tokio::time::sleep(Duration::from_millis(tick_ms)) => {}
        }

        // ---- Refresh settings ------------------------------------------
        let settings = match store::get_settings(&app) {
            Ok(s) => s,
            Err(error) => {
                eprintln!("[incoming] settings read failed: {error}");
                backoff_active = true;
                continue;
            }
        };

        // ---- Permission preflight --------------------------------------
        match crate::incoming::current_permission_state() {
            PermissionState::Granted | PermissionState::NotApplicable => {}
            PermissionState::Denied => {
                if last_note != Some("permission_denied") {
                    let _ = app.emit(
                        "incoming:permission_required",
                        "Screen Recording permission is required. Grant it in System Settings → Privacy & Security → Screen Recording, then restart Lingo.",
                    );
                    last_note = Some("permission_denied");
                }
                backoff_active = true;
                continue;
            }
            PermissionState::Unknown => {
                if last_note != Some("permission_unknown") {
                    let _ = app.emit(
                        "incoming:permission_required",
                        "Screen Recording permission status is unknown on this macOS version.",
                    );
                    last_note = Some("permission_unknown");
                }
                backoff_active = true;
                continue;
            }
        }

        // ---- Region lookup --------------------------------------------
        let region = match settings.incoming_regions.get(&settings.game_scene) {
            Some(r) => r.clone(),
            None => {
                if last_note != Some("region_missing") {
                    let _ = app.emit(
                        "incoming:region_required",
                        format!(
                            "No chat region calibrated for game scene '{}'. Open the Advanced settings on the home card to calibrate.",
                            settings.game_scene
                        ),
                    );
                    last_note = Some("region_missing");
                }
                backoff_active = true;
                continue;
            }
        };

        // ---- Capture ---------------------------------------------------
        let frame = match capture.capture(&region) {
            Ok(f) => f,
            Err(error) => {
                eprintln!("[incoming] capture failed: {error}");
                if last_note != Some("capture_error") {
                    let _ = app.emit("incoming:capture_error", error.to_string());
                    last_note = Some("capture_error");
                }
                backoff_active = true;
                continue;
            }
        };

        // ---- OCR -------------------------------------------------------
        let lines = match ocr.recognize_multilingual(&frame, &OcrOptions::default()) {
            Ok(lines) => lines,
            Err(error) => {
                eprintln!("[incoming] OCR failed: {error}");
                if last_note != Some("ocr_error") {
                    let _ = app.emit("incoming:ocr_error", error.to_string());
                    last_note = Some("ocr_error");
                }
                backoff_active = true;
                continue;
            }
        };

        if last_note.is_some() {
            // We recovered — clear the sticky-note status so the next
            // genuine error fires its event again.
            let _ = app.emit("incoming:status_cleared", ());
            last_note = None;
        }
        backoff_active = false;

        // ---- Tracker dedupe -------------------------------------------
        let new_msgs = tracker.ingest(&lines);
        if new_msgs.is_empty() {
            continue;
        }

        // ---- Per-line translate (fire-and-forget, bounded concurrency) -
        for msg in new_msgs {
            let app_for_task = app.clone();
            let target_lang = settings.translation_to.clone();
            let game_scene = settings.game_scene.clone();
            let counter = id_counter.clone();
            let permits = translate_permits.clone();
            tauri::async_runtime::spawn(async move {
                translate_and_emit(app_for_task, msg, target_lang, game_scene, counter, permits)
                    .await;
            });
        }
    }

    let _ = app.emit("incoming:stopped", ());
}

/// Resolve the next tick duration from the current settings (so live
/// capture-rate edits take effect on the very next frame).
fn settings_tick_ms(app: &AppHandle) -> u64 {
    let hz = store::get_settings(app)
        .map(|s| s.incoming_capture_rate_hz)
        .unwrap_or(1.5)
        .max(0.5);
    let raw = (1000.0 / hz) as u64;
    raw.clamp(MIN_TICK_MS, MAX_TICK_MS)
}

async fn translate_and_emit(
    app: AppHandle,
    msg: NewMessage,
    target_lang: String,
    game_scene: String,
    counter: Arc<AtomicU64>,
    permits: Arc<Semaphore>,
) {
    // Skip lines that are already in the user's native language. The
    // proxy would noop them, but we save a round-trip and avoid the
    // overlay flashing the same text twice.
    if is_same_language_as_target(&msg.text, &target_lang) {
        return;
    }

    // Cap in-flight translation requests so a stalled proxy can't make us
    // grow unbounded under bursty chat. If we can't acquire within a
    // bounded window, drop the line rather than queue it — by the time
    // the proxy recovers the line is stale anyway.
    let permit = match tokio::time::timeout(Duration::from_secs(2), permits.acquire_owned()).await {
        Ok(Ok(p)) => p,
        Ok(Err(_)) | Err(_) => {
            eprintln!(
                "[incoming] dropping line (translate queue full): {:?}",
                msg.sender
            );
            return;
        }
    };

    let translated = match translate_incoming(&msg.text, &target_lang, &game_scene).await {
        Ok(text) => text,
        Err(error) => {
            eprintln!(
                "[incoming] translate failed for {:?} → {}: {}",
                msg.sender, target_lang, error
            );
            drop(permit);
            return;
        }
    };
    drop(permit);

    if translated.trim().is_empty() {
        return;
    }

    let id_value = counter.fetch_add(1, Ordering::Relaxed);
    let payload = IncomingTranslation {
        id: format!("ic-{id_value}"),
        sender: msg.sender,
        scope: msg.scope,
        source_text: msg.text,
        translated_text: translated,
        source_lang: None,
        target_lang: Some(target_lang),
        timestamp_ms: now_ms(),
        demo: false,
    };

    if let Err(error) = app.emit("incoming:translation", &payload) {
        eprintln!("[incoming] emit failed: {error}");
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Heuristic: if the OCR text appears to be the user's native language
/// already, don't bother translating. This is intentionally conservative
/// — false negatives just spend an API call, false positives hide a
/// translation entirely, so we lean toward "always translate".
fn is_same_language_as_target(text: &str, target: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return true;
    }
    let target_norm = target.to_ascii_lowercase();
    let cjk_chars = trimmed.chars().filter(|c| is_cjk(*c)).count();
    let latin_chars = trimmed.chars().filter(|c| c.is_ascii_alphabetic()).count();
    let cyrillic_chars = trimmed.chars().filter(|c| is_cyrillic(*c)).count();
    let total_letters = cjk_chars + latin_chars + cyrillic_chars;
    if total_letters == 0 {
        return true; // pure punctuation / numbers
    }

    if target_norm.starts_with("zh") {
        // Mostly CJK and not significantly Cyrillic → already Chinese.
        return cjk_chars * 2 >= total_letters && cyrillic_chars == 0;
    }
    if target_norm.starts_with("en") {
        return latin_chars * 2 >= total_letters && cjk_chars == 0 && cyrillic_chars == 0;
    }
    if target_norm.starts_with("ru") {
        return cyrillic_chars * 2 >= total_letters;
    }
    false
}

fn is_cjk(c: char) -> bool {
    let code = c as u32;
    (0x4E00..=0x9FFF).contains(&code) // CJK Unified Ideographs
        || (0x3000..=0x303F).contains(&code) // CJK Symbols and Punctuation
        || (0x3400..=0x4DBF).contains(&code) // CJK Unified Ideographs Extension A
}

fn is_cyrillic(c: char) -> bool {
    let code = c as u32;
    (0x0400..=0x04FF).contains(&code) || (0x0500..=0x052F).contains(&code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_language_zh_recognizes_chinese_text() {
        assert!(is_same_language_as_target("推中路", "zh"));
        assert!(is_same_language_as_target("等我大招再推", "zh-CN"));
        assert!(!is_same_language_as_target("gg wp", "zh"));
        assert!(!is_same_language_as_target("Иди в лес", "zh"));
    }

    #[test]
    fn same_language_en_recognizes_english_text() {
        assert!(is_same_language_as_target("smoke and gank bot", "en"));
        assert!(!is_same_language_as_target("推中路", "en"));
    }

    #[test]
    fn same_language_ru_recognizes_cyrillic_text() {
        assert!(is_same_language_as_target("Иди в лес я фармлю", "ru"));
        assert!(!is_same_language_as_target("gg wp", "ru"));
    }

    #[test]
    fn same_language_handles_empty_input() {
        assert!(is_same_language_as_target("", "zh"));
        assert!(is_same_language_as_target("   ", "zh"));
        assert!(is_same_language_as_target("123 456", "zh")); // punctuation/numbers only
    }
}
