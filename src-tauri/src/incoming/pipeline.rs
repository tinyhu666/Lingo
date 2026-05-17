//! capture → OCR → tracker → translation loop.
//!
//! v0.7.0-rc.1 state: real lifecycle (tokio task, start/stop, cancellation)
//! but the capture + OCR stages still return [`Unimplemented`]. When the run
//! loop detects that both engines are unavailable it switches to a **mock
//! demo emitter** so the front-end overlay can render real-shaped events
//! end-to-end. The demo events are tagged `demo: true` so the UI labels them
//! plainly and users can tell what's real.
//!
//! As capture / OCR engines start returning Ok, the loop will incrementally
//! become real. No changes required from the pipeline's consumers.

use crate::incoming::capture::default_capture_source;
use crate::incoming::ocr::default_ocr_engine;
use crate::incoming::tracker::LineTracker;
use crate::incoming::{IncomingTranslation, MessageScope};
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

const MIN_TICK_MS: u64 = 150;
const MAX_TICK_MS: u64 = 4_000;
const DEMO_TICK_INTERVAL: Duration = Duration::from_millis(2_600);

#[derive(Debug, Clone, Serialize)]
pub struct StartOptions {
    pub capture_rate_hz: f32,
    pub game_scene: String,
    pub target_lang: String,
    pub show_original: bool,
}

#[derive(Default)]
pub struct IncomingPipeline {
    inner: Mutex<PipelineState>,
}

#[derive(Default)]
struct PipelineState {
    handle: Option<JoinHandle<()>>,
    cancel: Option<oneshot::Sender<()>>,
    running: bool,
}

impl IncomingPipeline {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns true if the pipeline's background task is currently running.
    pub fn is_running(&self) -> bool {
        self.inner.lock().map(|s| s.running).unwrap_or(false)
    }

    /// Spawns the run loop. Idempotent: a second call while already running
    /// is a no-op rather than an error.
    pub fn start(&self, app: AppHandle, opts: StartOptions) -> Result<(), String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|e| format!("pipeline mutex poisoned: {e}"))?;
        if state.running {
            return Ok(());
        }
        let (cancel_tx, cancel_rx) = oneshot::channel();
        let handle = tauri::async_runtime::spawn(run_loop(app, opts, cancel_rx));
        state.handle = Some(handle);
        state.cancel = Some(cancel_tx);
        state.running = true;
        Ok(())
    }

    /// Cancels the run loop. Safe to call when already stopped.
    pub fn stop(&self) {
        let (cancel, handle) = {
            let Ok(mut state) = self.inner.lock() else {
                return;
            };
            state.running = false;
            (state.cancel.take(), state.handle.take())
        };
        if let Some(tx) = cancel {
            let _ = tx.send(());
        }
        if let Some(handle) = handle {
            handle.abort();
        }
    }
}

async fn run_loop(app: AppHandle, opts: StartOptions, mut cancel: oneshot::Receiver<()>) {
    let capture = default_capture_source();
    let ocr = default_ocr_engine();
    let demo_mode = capture.is_err() || ocr.is_err();
    let mut tracker = LineTracker::default();

    let tick_period = if demo_mode {
        DEMO_TICK_INTERVAL
    } else {
        let raw_ms = (1000.0 / opts.capture_rate_hz.max(0.5)) as u64;
        Duration::from_millis(raw_ms.clamp(MIN_TICK_MS, MAX_TICK_MS))
    };

    if demo_mode {
        let _ = app.emit(
            "incoming:status_note",
            "Pipeline running in demo mode (capture/OCR not yet implemented).",
        );
    }

    let mut ticker = tokio::time::interval(tick_period);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let mut idx: usize = 0;
    let mut next_id: u64 = 1;

    loop {
        tokio::select! {
            biased;
            _ = &mut cancel => {
                break;
            }
            _ = ticker.tick() => {
                if demo_mode {
                    let msg = demo_message_at(idx, &mut next_id, &opts);
                    idx = idx.wrapping_add(1);
                    if let Err(error) = app.emit("incoming:translation", &msg) {
                        eprintln!("[incoming] emit failed: {error}");
                    }
                    // Even in demo mode we still pump the tracker so its state
                    // resembles a real run for future debugging.
                    let _ = tracker.ingest(&[]);
                } else {
                    // Real pipeline goes here in v0.7.0-rc.2:
                    //   let frame = capture.as_ref().unwrap().capture(&region)?;
                    //   let lines = ocr.as_ref().unwrap().recognize(&frame, &opts)?;
                    //   let new_msgs = tracker.ingest(&lines);
                    //   for each → translate-proxy → emit.
                    break;
                }
            }
        }
    }

    let _ = app.emit("incoming:stopped", ());
}

// ---------------------------------------------------------------------------
// Demo corpus
// ---------------------------------------------------------------------------

fn demo_message_at(idx: usize, next_id: &mut u64, opts: &StartOptions) -> IncomingTranslation {
    let sample = &DEMO_SAMPLES[idx % DEMO_SAMPLES.len()];
    let id_value = *next_id;
    *next_id = next_id.wrapping_add(1);

    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let translated = pick_translation(sample, &opts.target_lang);

    IncomingTranslation {
        id: format!("demo-{id_value}"),
        sender: Some(sample.sender.to_string()),
        scope: Some(sample.scope),
        source_text: sample.source.to_string(),
        translated_text: translated.to_string(),
        source_lang: Some(sample.source_lang.to_string()),
        target_lang: Some(opts.target_lang.clone()),
        timestamp_ms,
        demo: true,
    }
}

fn pick_translation<'a>(sample: &'a DemoSample, target: &str) -> &'a str {
    match target {
        "en" | "en-US" => sample.translated_en,
        "ru" | "ru-RU" => sample.translated_ru,
        _ => sample.translated_zh,
    }
}

struct DemoSample {
    sender: &'static str,
    scope: MessageScope,
    source: &'static str,
    source_lang: &'static str,
    translated_zh: &'static str,
    translated_en: &'static str,
    translated_ru: &'static str,
}

const DEMO_SAMPLES: &[DemoSample] = &[
    DemoSample {
        sender: "Pudge",
        scope: MessageScope::Team,
        source: "gg wp",
        source_lang: "en",
        translated_zh: "干得漂亮",
        translated_en: "Good game, well played.",
        translated_ru: "Хорошая игра, молодцы.",
    },
    DemoSample {
        sender: "AntiMage",
        scope: MessageScope::All,
        source: "mid miss, beware",
        source_lang: "en",
        translated_zh: "中路丢人，小心",
        translated_en: "Mid missing, watch out.",
        translated_ru: "Мид пропал, осторожно.",
    },
    DemoSample {
        sender: "Sven",
        scope: MessageScope::Team,
        source: "smoke and gank bot",
        source_lang: "en",
        translated_zh: "抱团烟雾偷下路",
        translated_en: "Smoke and gank bot lane.",
        translated_ru: "Дым и ганк на боте.",
    },
    DemoSample {
        sender: "Lion",
        scope: MessageScope::All,
        source: "Иди в лес, я фармлю",
        source_lang: "ru",
        translated_zh: "去打野，我在补刀",
        translated_en: "Go jungle, I'm farming.",
        translated_ru: "Иди в лес, я фармлю.",
    },
    DemoSample {
        sender: "Templar",
        scope: MessageScope::Team,
        source: "no buyback on enemy carry",
        source_lang: "en",
        translated_zh: "敌方核心没买活",
        translated_en: "Enemy carry has no buyback.",
        translated_ru: "У вражеского керри нет байбэка.",
    },
    DemoSample {
        sender: "Phantom",
        scope: MessageScope::Team,
        source: "wait my ult then push",
        source_lang: "en",
        translated_zh: "等我大招再推",
        translated_en: "Wait for my ult then push.",
        translated_ru: "Подождите мой ульт, потом пуш.",
    },
];
