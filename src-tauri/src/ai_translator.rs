use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::AppHandle;

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

const COMPILED_BACKEND_URL: Option<&str> = option_env!("LINGO_BACKEND_URL");
const COMPILED_FUNCTIONS_URL: Option<&str> = option_env!("SUPABASE_FUNCTIONS_URL");
const COMPILED_SUPABASE_URL: Option<&str> = option_env!("SUPABASE_URL");
const COMPILED_BACKEND_ANON_KEY: Option<&str> = option_env!("LINGO_BACKEND_ANON_KEY");
const COMPILED_SUPABASE_ANON_KEY: Option<&str> = option_env!("SUPABASE_ANON_KEY");

struct BackendConfig {
    base_url: String,
    api_key: Option<String>,
    source: &'static str,
}

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

fn normalize_url(raw: &str) -> Option<String> {
    let normalized = raw.trim().trim_end_matches('/').to_string();
    if normalized.is_empty() || normalized.contains("YOUR_") {
        return None;
    }
    Some(normalized)
}

fn normalize_supabase_root(raw: &str) -> Option<String> {
    normalize_url(raw).map(|value| format!("{}/functions/v1", value))
}

fn read_runtime_value(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .and_then(|value| normalize_url(&value))
}

fn read_runtime_backend_base_url() -> Option<(String, &'static str)> {
    read_runtime_value("LINGO_BACKEND_URL")
        .map(|value| (value, "runtime:LINGO_BACKEND_URL"))
        .or_else(|| {
            read_runtime_value("SUPABASE_FUNCTIONS_URL")
                .map(|value| (value, "runtime:SUPABASE_FUNCTIONS_URL"))
        })
        .or_else(|| {
            std::env::var("SUPABASE_URL")
                .ok()
                .and_then(|value| normalize_supabase_root(&value))
                .map(|value| (value, "runtime:SUPABASE_URL"))
        })
}

fn read_compiled_backend_base_url() -> Option<(String, &'static str)> {
    COMPILED_BACKEND_URL
        .and_then(normalize_url)
        .map(|value| (value, "compiled:LINGO_BACKEND_URL"))
        .or_else(|| {
            COMPILED_FUNCTIONS_URL
                .and_then(normalize_url)
                .map(|value| (value, "compiled:SUPABASE_FUNCTIONS_URL"))
        })
        .or_else(|| {
            COMPILED_SUPABASE_URL
                .and_then(normalize_supabase_root)
                .map(|value| (value, "compiled:SUPABASE_URL"))
        })
}

fn read_runtime_backend_api_key() -> Option<(String, &'static str)> {
    ["LINGO_BACKEND_ANON_KEY", "SUPABASE_ANON_KEY"]
        .into_iter()
        .find_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .map(|value| {
                    let source = if key == "LINGO_BACKEND_ANON_KEY" {
                        "runtime:LINGO_BACKEND_ANON_KEY"
                    } else {
                        "runtime:SUPABASE_ANON_KEY"
                    };
                    (value, source)
                })
        })
}

fn read_compiled_backend_api_key() -> Option<(String, &'static str)> {
    COMPILED_BACKEND_ANON_KEY
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(|value| (value, "compiled:LINGO_BACKEND_ANON_KEY"))
        .or_else(|| {
            COMPILED_SUPABASE_ANON_KEY
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .map(|value| (value, "compiled:SUPABASE_ANON_KEY"))
        })
}

fn backend_config() -> Result<BackendConfig> {
    let (base_url, source) = read_runtime_backend_base_url()
        .or_else(read_compiled_backend_base_url)
        .ok_or_else(|| {
            anyhow!(
                "未配置翻译代理地址：请设置运行时 LINGO_BACKEND_URL / SUPABASE_URL，或在发布构建时注入默认后端配置"
            )
        })?;

    let api_key = read_runtime_backend_api_key()
        .or_else(read_compiled_backend_api_key)
        .map(|(value, key_source)| {
            println!("[translate] backend_public_key_source={}", key_source);
            value
        });

    Ok(BackendConfig {
        base_url,
        api_key,
        source,
    })
}

fn summarize_body(body: &str) -> String {
    let compact = body.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = compact.trim();
    if trimmed.is_empty() {
        return "<empty>".to_string();
    }

    const MAX_LEN: usize = 180;
    let mut chars = trimmed.chars();
    let snippet = chars.by_ref().take(MAX_LEN).collect::<String>();
    if chars.next().is_some() {
        format!("{}...", snippet)
    } else {
        snippet
    }
}

fn extract_error_message(payload: &Value) -> Option<String> {
    payload
        .get("message")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .or_else(|| {
            payload
                .get("error")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
        .or_else(|| {
            payload
                .get("error")
                .and_then(|value| value.get("message"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        })
}

pub async fn translate_with_gpt(app: &AppHandle, original: &str) -> Result<String> {
    let started = Instant::now();
    let text = original.trim();
    if text.is_empty() {
        return Ok(String::new());
    }

    let settings = crate::store::get_settings(app)?;
    let backend = backend_config()?;
    let endpoint = if backend.base_url.ends_with("/translate") {
        backend.base_url.clone()
    } else {
        format!("{}/translate", backend.base_url)
    };
    println!(
        "[translate] backend_source={} endpoint={}",
        backend.source, endpoint
    );

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
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&body);

    if let Some(api_key) = &backend.api_key {
        request = request
            .header("apikey", api_key)
            .header("Authorization", format!("Bearer {}", api_key));
    }

    let request_started = Instant::now();
    let response = request
        .send()
        .await
        .map_err(|error| anyhow!("翻译代理请求失败: {}", error))?;
    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|error| anyhow!("读取翻译代理响应失败: {}", error))?;

    let json: Value = serde_json::from_str(&body_text).map_err(|_| {
        if status.is_success() {
            anyhow!("翻译代理返回了非 JSON 数据: {}", summarize_body(&body_text))
        } else {
            anyhow!(
                "翻译代理请求失败 (HTTP {}): {}",
                status.as_u16(),
                summarize_body(&body_text)
            )
        }
    })?;

    if !status.is_success() {
        let trace_id = json
            .get("trace_id")
            .and_then(|value| value.as_str())
            .unwrap_or("-");
        let message = extract_error_message(&json).unwrap_or_else(|| {
            format!("翻译代理请求失败 (HTTP {})", status.as_u16())
        });
        return Err(anyhow!("{} [trace_id={}]", message, trace_id));
    }

    let translated = json
        .get("translated_text")
        .and_then(|value| value.as_str())
        .ok_or_else(|| anyhow!("翻译代理返回格式异常，缺少 translated_text"))?;

    let cleaned = cleanup_text(translated);
    if cleaned.trim().is_empty() {
        return Err(anyhow!("翻译代理返回了空结果"));
    }

    let trace_id = json
        .get("trace_id")
        .and_then(|value| value.as_str())
        .unwrap_or("-");
    let model = json
        .get("model")
        .and_then(|value| value.as_str())
        .unwrap_or("-");
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

    Ok(cleaned)
}
