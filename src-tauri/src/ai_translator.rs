use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::AppHandle;

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn shared_http_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(20))
            .pool_idle_timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| Client::new())
    })
}

fn cleanup_text(text: &str) -> String {
    let trimmed = text.trim();
    if let Some(end_pos) = trimmed.find("</think>") {
        return trimmed[(end_pos + 8)..].trim().to_string();
    }
    trimmed.to_string()
}

fn backend_base_url() -> Result<String> {
    let direct = std::env::var("LINGO_BACKEND_URL").ok();
    if let Some(url) = direct {
        let normalized = url.trim().trim_end_matches('/').to_string();
        if !normalized.is_empty() {
            return Ok(normalized);
        }
    }

    let functions = std::env::var("SUPABASE_FUNCTIONS_URL").ok();
    if let Some(url) = functions {
        let normalized = url.trim().trim_end_matches('/').to_string();
        if !normalized.is_empty() {
            return Ok(normalized);
        }
    }

    let supabase = std::env::var("SUPABASE_URL").ok();
    if let Some(url) = supabase {
        let normalized = format!("{}/functions/v1", url.trim().trim_end_matches('/'));
        if !normalized.contains("YOUR_") {
            return Ok(normalized);
        }
    }

    Err(anyhow!(
        "未配置翻译代理地址，请设置 LINGO_BACKEND_URL 或 SUPABASE_URL"
    ))
}

fn backend_apikey() -> Option<String> {
    let keys = ["LINGO_BACKEND_ANON_KEY", "SUPABASE_ANON_KEY"];
    for key in keys {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

fn extract_error_message(payload: &Value) -> Option<String> {
    payload
        .get("message")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .or_else(|| {
            payload
                .get("error")
                .and_then(|v| v.get("message"))
                .and_then(|v| v.as_str())
                .map(|v| v.to_string())
        })
}

pub async fn translate_with_gpt(app: &AppHandle, original: &str) -> Result<String> {
    let started = Instant::now();
    let text = original.trim();
    if text.is_empty() {
        return Ok(String::new());
    }

    let settings = crate::store::get_settings(app)?;
    let access_token = crate::auth::require_access_token(app)?;
    let base_url = backend_base_url()?;
    let endpoint = if base_url.ends_with("/translate") {
        base_url
    } else {
        format!("{}/translate", base_url)
    };

    let body = json!({
        "text": text,
        "translation_from": settings.translation_from,
        "translation_to": settings.translation_to,
        "translation_mode": settings.translation_mode,
        "game_scene": settings.game_scene,
        "daily_mode": settings.daily_mode,
    });

    let client = shared_http_client();
    let mut request = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&body);

    if let Some(apikey) = backend_apikey() {
        request = request.header("apikey", apikey);
    }

    let request_started = Instant::now();
    let response = request.send().await?;
    let status = response.status();
    let body_text = response.text().await?;
    let json: Value = serde_json::from_str(&body_text)
        .map_err(|_| anyhow!("翻译代理返回了非 JSON 数据: {}", body_text))?;

    if !status.is_success() {
        let message = extract_error_message(&json).unwrap_or_else(|| "翻译代理请求失败".to_string());
        return Err(anyhow!(message));
    }

    let translated = json
        .get("translated_text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("翻译代理返回格式异常，缺少 translated_text"))?;

    let trace_id = json.get("trace_id").and_then(|v| v.as_str()).unwrap_or("-");
    let model = json.get("model").and_then(|v| v.as_str()).unwrap_or("-");
    println!(
        "[perf] backend_translate elapsed_ms={} trace_id={} model={}",
        request_started.elapsed().as_millis(),
        trace_id,
        model
    );
    println!(
        "[perf] translate_total elapsed_ms={} trace_id={}",
        started.elapsed().as_millis(),
        trace_id
    );

    Ok(cleanup_text(translated))
}
