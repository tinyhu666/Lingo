use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static OPERATION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Default, Serialize)]
pub struct DiagnosticMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_length: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation_from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation_to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_scene: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub daily_mode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
struct TranslationDiagnostic<'a> {
    operation_id: &'a str,
    stage: &'a str,
    status: &'a str,
    elapsed_ms: u64,
    #[serde(flatten)]
    metadata: DiagnosticMetadata,
}

pub fn new_operation_id() -> String {
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let counter = OPERATION_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(
        "lingo-{timestamp_ms:x}-{:x}-{counter:x}",
        std::process::id()
    )
}

pub fn emit(
    app: &AppHandle,
    operation_id: &str,
    stage: &str,
    status: &str,
    elapsed_ms: u64,
    metadata: DiagnosticMetadata,
) {
    if let Err(error) = app.emit(
        "translation_diagnostic",
        TranslationDiagnostic {
            operation_id,
            stage,
            status,
            elapsed_ms,
            metadata,
        },
    ) {
        eprintln!("translation diagnostic emit failed: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operation_ids_are_unique_and_header_safe() {
        let first = new_operation_id();
        let second = new_operation_id();
        assert_ne!(first, second);
        assert!(first.len() <= 128);
        assert!(first
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-'));
    }
}
