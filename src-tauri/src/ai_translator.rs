use crate::store::AppSettings;
use anyhow::{anyhow, Result};
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::time::sleep;

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
static PREWARM_LAST_RUN_MS: AtomicU64 = AtomicU64::new(0);
const MAX_PROXY_ATTEMPTS: usize = 2;
const PROXY_RETRY_DELAY_MS: u64 = 120;
const PREWARM_COOLDOWN_MS: u64 = 30_000;
const DEBUG_LOCAL_PROXY_URL: &str = "http://127.0.0.1:8787";

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
            .timeout(Duration::from_secs(15))
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

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
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

fn read_debug_backend_base_url() -> Option<(String, &'static str)> {
    if !cfg!(debug_assertions) {
        return None;
    }

    read_runtime_value("LINGO_LOCAL_PROXY_URL")
        .map(|value| (value, "runtime:LINGO_LOCAL_PROXY_URL"))
        .or_else(|| {
            normalize_url(DEBUG_LOCAL_PROXY_URL)
                .map(|value| (value, "debug-default:LINGO_LOCAL_PROXY_URL"))
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
        .or_else(read_debug_backend_base_url)
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

fn normalize_proxy_error_message(message: String) -> String {
    let lower = message.to_lowercase();

    if lower.contains("timed out") || lower.contains("timeout") {
        return "翻译服务响应超时，请稍后重试".to_string();
    }

    if lower.contains("empty model response") || lower.contains("空结果") {
        return "翻译服务返回空结果，请重试".to_string();
    }

    message
}

fn is_local_proxy_source(source: &str) -> bool {
    matches!(
        source,
        "runtime:LINGO_LOCAL_PROXY_URL" | "debug-default:LINGO_LOCAL_PROXY_URL"
    )
}

fn local_proxy_unreachable_message() -> &'static str {
    "本地翻译代理不可达：请先运行 npm run proxy:dev，或显式设置 LINGO_BACKEND_URL"
}

fn request_error_message(backend: &BackendConfig, error: &reqwest::Error) -> String {
    if is_local_proxy_source(backend.source) && (error.is_connect() || error.is_timeout()) {
        return local_proxy_unreachable_message().to_string();
    }

    format!(
        "翻译代理请求失败: {}",
        normalize_proxy_error_message(error.to_string())
    )
}

fn should_retry_transport_error(error: &reqwest::Error) -> bool {
    error.is_timeout() || error.is_connect()
}

fn should_retry_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

pub async fn warm_translation_backend() -> Result<()> {
    let now_ms = now_unix_ms();
    let last_run_ms = PREWARM_LAST_RUN_MS.load(Ordering::Acquire);
    if now_ms.saturating_sub(last_run_ms) < PREWARM_COOLDOWN_MS {
        println!(
            "[translate] skipping_prewarm cooldown_ms_remaining={}",
            PREWARM_COOLDOWN_MS.saturating_sub(now_ms.saturating_sub(last_run_ms))
        );
        return Ok(());
    }
    PREWARM_LAST_RUN_MS.store(now_ms, Ordering::Release);

    let backend = backend_config()?;
    let endpoint = if backend.base_url.ends_with("/translate") {
        backend.base_url.clone()
    } else {
        format!("{}/translate", backend.base_url)
    };
    let started = Instant::now();

    let response = shared_http_client()
        .get(&endpoint)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| anyhow!("预热翻译代理失败: {}", request_error_message(&backend, &error)))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|error| anyhow!("读取预热响应失败: {}", error))?;

    if !status.is_success() {
        return Err(anyhow!(
            "预热翻译代理失败 (HTTP {}): {}",
            status.as_u16(),
            summarize_body(&body_text)
        ));
    }

    let payload: Value = serde_json::from_str(&body_text).map_err(|_| {
        anyhow!(
            "预热翻译代理返回了非 JSON 数据: {}",
            summarize_body(&body_text)
        )
    })?;
    let provider = payload
        .get("provider")
        .and_then(|value| value.as_str())
        .unwrap_or("-");
    let model = payload
        .get("model")
        .and_then(|value| value.as_str())
        .unwrap_or("-");
    let trace_id = payload
        .get("trace_id")
        .and_then(|value| value.as_str())
        .unwrap_or("-");
    println!(
        "[perf] translate_prewarm elapsed_ms={} trace_id={} provider={} model={}",
        started.elapsed().as_millis(),
        trace_id,
        provider,
        model
    );

    Ok(())
}

pub async fn translate_with_gpt(original: &str, settings: &AppSettings) -> Result<String> {
    let started = Instant::now();
    let text = original.trim();
    if text.is_empty() {
        return Ok(String::new());
    }

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
    let request_started = Instant::now();

    for attempt in 1..=MAX_PROXY_ATTEMPTS {
        let mut request = client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&body);

        if let Some(api_key) = &backend.api_key {
            request = request
                .header("apikey", api_key)
                .header("Authorization", format!("Bearer {}", api_key));
        }

        let response = match request.send().await {
            Ok(response) => response,
            Err(error) => {
                if attempt < MAX_PROXY_ATTEMPTS && should_retry_transport_error(&error) {
                    println!(
                        "[translate] retrying_transport attempt={} reason={}",
                        attempt, error
                    );
                    sleep(Duration::from_millis(PROXY_RETRY_DELAY_MS)).await;
                    continue;
                }

                return Err(anyhow!(request_error_message(&backend, &error)));
            }
        };
        let status = response.status();
        let body_text = response
            .text()
            .await
            .map_err(|error| anyhow!("读取翻译代理响应失败: {}", error))?;

        let json: Value = match serde_json::from_str(&body_text) {
            Ok(value) => value,
            Err(_) => {
                if !status.is_success()
                    && attempt < MAX_PROXY_ATTEMPTS
                    && should_retry_status(status)
                {
                    println!(
                        "[translate] retrying_non_json_response attempt={} status={}",
                        attempt,
                        status.as_u16()
                    );
                    sleep(Duration::from_millis(PROXY_RETRY_DELAY_MS)).await;
                    continue;
                }

                return Err(if status.is_success() {
                    anyhow!("翻译代理返回了非 JSON 数据: {}", summarize_body(&body_text))
                } else {
                    anyhow!(
                        "翻译代理请求失败 (HTTP {}): {}",
                        status.as_u16(),
                        summarize_body(&body_text)
                    )
                });
            }
        };

        if !status.is_success() {
            let trace_id = json
                .get("trace_id")
                .and_then(|value| value.as_str())
                .unwrap_or("-");
            let message = normalize_proxy_error_message(
                extract_error_message(&json)
                    .unwrap_or_else(|| format!("翻译代理请求失败 (HTTP {})", status.as_u16())),
            );
            if attempt < MAX_PROXY_ATTEMPTS && should_retry_status(status) {
                println!(
                    "[translate] retrying_proxy_status attempt={} status={} trace_id={}",
                    attempt,
                    status.as_u16(),
                    trace_id
                );
                sleep(Duration::from_millis(PROXY_RETRY_DELAY_MS)).await;
                continue;
            }

            return Err(anyhow!("{} [trace_id={}]", message, trace_id));
        }

        let translated = json
            .get("translated_text")
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("翻译代理返回格式异常，缺少 translated_text"))?;

        let cleaned = cleanup_text(translated);
        let trace_id = json
            .get("trace_id")
            .and_then(|value| value.as_str())
            .unwrap_or("-");
        if cleaned.trim().is_empty() {
            if attempt < MAX_PROXY_ATTEMPTS {
                println!(
                    "[translate] retrying_empty_translated_text attempt={} trace_id={}",
                    attempt, trace_id
                );
                sleep(Duration::from_millis(PROXY_RETRY_DELAY_MS)).await;
                continue;
            }
            return Err(anyhow!(
                "翻译服务返回空结果，请重试 [trace_id={}]",
                trace_id
            ));
        }

        let model = json
            .get("model")
            .and_then(|value| value.as_str())
            .unwrap_or("-");
        let response_source = json
            .get("response_source")
            .and_then(|value| value.as_str())
            .or_else(|| json.get("served_from").and_then(|value| value.as_str()))
            .unwrap_or("model");
        let attempt_count = json
            .get("attempt_count")
            .and_then(|value| value.as_u64())
            .unwrap_or(attempt as u64);
        let model_latency_ms = json
            .get("model_latency_ms")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let prompt_variant = json
            .get("prompt_variant")
            .and_then(|value| value.as_str())
            .unwrap_or("-");
        let style_profile = json
            .get("style_profile")
            .and_then(|value| value.as_str())
            .unwrap_or("-");
        let model_route = json
            .get("model_route")
            .and_then(|value| value.as_str())
            .unwrap_or("-");
        let effective_max_tokens = json
            .get("effective_max_tokens")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let effective_temperature = json
            .get("effective_temperature")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
        let proxy_elapsed_ms = request_started.elapsed().as_millis() as u64;
        let proxy_overhead_ms = json
            .get("proxy_overhead_ms")
            .and_then(|value| value.as_u64())
            .unwrap_or_else(|| proxy_elapsed_ms.saturating_sub(model_latency_ms));
        println!(
            "[perf] backend_translate elapsed_ms={} model_latency_ms={} proxy_overhead_ms={} attempts={} source={} route={} prompt_variant={} style_profile={} max_tokens={} temperature={} trace_id={} model={}",
            proxy_elapsed_ms,
            model_latency_ms,
            proxy_overhead_ms,
            attempt_count,
            response_source,
            model_route,
            prompt_variant,
            style_profile,
            effective_max_tokens,
            effective_temperature,
            trace_id,
            model
        );
        println!(
            "[perf] translate_total elapsed_ms={} trace_id={}",
            started.elapsed().as_millis(),
            trace_id
        );

        return Ok(cleaned);
    }

    Err(anyhow!("翻译服务暂时不可用，请稍后重试"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::AppSettings;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Mutex, OnceLock};
    use std::thread;

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    struct EnvGuard {
        saved: HashMap<&'static str, Option<String>>,
    }

    impl EnvGuard {
        fn set(pairs: &[(&'static str, Option<&str>)]) -> Self {
            let saved = pairs
                .iter()
                .map(|(key, _)| (*key, std::env::var(key).ok()))
                .collect::<HashMap<_, _>>();

            for (key, value) in pairs {
                match value {
                    Some(next) => unsafe {
                        std::env::set_var(key, next);
                    },
                    None => unsafe {
                        std::env::remove_var(key);
                    },
                }
            }

            Self { saved }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            for (key, value) in &self.saved {
                match value {
                    Some(previous) => unsafe {
                        std::env::set_var(key, previous);
                    },
                    None => unsafe {
                        std::env::remove_var(key);
                    },
                }
            }
        }
    }

    fn read_http_request(stream: &mut TcpStream) -> String {
        let mut buffer = [0_u8; 8192];
        let bytes_read = stream.read(&mut buffer).unwrap_or(0);
        String::from_utf8_lossy(&buffer[..bytes_read]).into_owned()
    }

    fn start_mock_translate_server(response_body: &'static str) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock translate server");
        let address = format!("http://{}", listener.local_addr().expect("mock local addr"));

        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept mock connection");
            let request = read_http_request(&mut stream);
            assert!(
                request.starts_with("POST /translate HTTP/1.1"),
                "unexpected request line: {request}"
            );
            assert!(
                request.contains("\"text\":\"你好\""),
                "request body should include original text: {request}"
            );

            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream
                .write_all(response.as_bytes())
                .expect("write mock translate response");
            stream.flush().expect("flush mock translate response");
        });

        (address, handle)
    }

    #[test]
    fn translate_with_gpt_uses_mock_proxy_and_returns_translated_text() {
        let _guard = env_lock().lock().expect("lock env");
        PREWARM_LAST_RUN_MS.store(0, Ordering::Release);
        let (base_url, handle) = start_mock_translate_server(
            r#"{"translated_text":"Hello team","trace_id":"test-trace","model":"mock-model","response_source":"model","attempt_count":1,"model_latency_ms":4,"prompt_variant":"translate","effective_max_tokens":40,"effective_temperature":0.1}"#,
        );
        let _env = EnvGuard::set(&[
            ("LINGO_BACKEND_URL", Some(base_url.as_str())),
            ("LINGO_BACKEND_ANON_KEY", None),
            ("SUPABASE_FUNCTIONS_URL", None),
            ("SUPABASE_URL", None),
            ("SUPABASE_ANON_KEY", None),
            ("LINGO_LOCAL_PROXY_URL", None),
        ]);

        let translated = tauri::async_runtime::block_on(async {
            translate_with_gpt("你好", &AppSettings::default()).await
        })
        .expect("translate should succeed");

        handle.join().expect("mock translate server should exit cleanly");
        assert_eq!(translated, "Hello team");
    }

    #[test]
    fn warm_translation_backend_surfaces_actionable_local_proxy_error() {
        let _guard = env_lock().lock().expect("lock env");
        PREWARM_LAST_RUN_MS.store(0, Ordering::Release);
        let _env = EnvGuard::set(&[
            ("LINGO_BACKEND_URL", None),
            ("LINGO_BACKEND_ANON_KEY", None),
            ("SUPABASE_FUNCTIONS_URL", None),
            ("SUPABASE_URL", None),
            ("SUPABASE_ANON_KEY", None),
            ("LINGO_LOCAL_PROXY_URL", Some("http://127.0.0.1:9")),
        ]);

        let error = tauri::async_runtime::block_on(async { warm_translation_backend().await })
            .expect_err("prewarm should fail without local proxy");

        let message = error.to_string();
        assert!(
            message.contains("本地翻译代理不可达"),
            "unexpected local proxy error message: {message}"
        );
    }
}
