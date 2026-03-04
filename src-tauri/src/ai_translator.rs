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

fn get_system_prompt(from: &str, to: &str, mode: &str, daily_mode: bool) -> String {
    if daily_mode {
        return format!(
            r#"你是一个翻译助手。请把用户输入从{from}翻译成{to}。
要求：
1) 只输出翻译结果
2) 不要解释
3) 保留专有名词和数字
4) 句子自然简洁"#,
        );
    }

    let mode_hint = match mode {
        "pro" => "使用 Dota2 职业比赛中常见、简短、明确的沟通风格。",
        "toxic" => "保持竞技语气，但不要添加辱骂、人身攻击或仇恨内容。",
        _ => "保持中性、清晰、适合 Dota2 游戏内即时沟通。",
    };

    format!(
        r#"你是 Dota2 游戏内翻译助手。请把用户输入从{from}翻译成{to}。
场景要求：
1) 只输出一条最终翻译
2) 不要换行，不要解释
3) 优先保留 Dota2 术语、技能/装备缩写（如 BKB、TP、smoke）
4) 输出尽量短，便于游戏内快速发送
5) {mode_hint}"#,
    )
}

fn extract_openai_text(response: &Value) -> Option<String> {
    response
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .map(|s| s.trim().to_string())
}

fn extract_anthropic_text(response: &Value) -> Option<String> {
    response
        .get("content")
        .and_then(|content| content.as_array())
        .and_then(|blocks| {
            blocks.iter().find_map(|block| {
                if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                    return block
                        .get("text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.trim().to_string());
                }
                None
            })
        })
}

fn cleanup_text(text: &str) -> String {
    let trimmed = text.trim();
    if let Some(end_pos) = trimmed.find("</think>") {
        return trimmed[(end_pos + 8)..].trim().to_string();
    }
    trimmed.to_string()
}

fn model_label(model_type: &str) -> &'static str {
    match model_type {
        "openai" => "OpenAI",
        "deepseek" => "DeepSeek",
        "qwen" => "Qwen",
        "moonshot" => "Moonshot",
        "siliconflow" => "SiliconFlow",
        "anthropic" => "Anthropic",
        "stepfun" => "StepFun",
        "custom" => "Custom",
        _ => "当前模型",
    }
}

fn get_model_config(settings: &crate::store::AppSettings) -> Result<crate::store::ModelConfig> {
    let model_key = settings.model_type.as_str();

    let config = settings
        .model_configs
        .get(model_key)
        .cloned()
        .or_else(|| settings.model_configs.get("openai").cloned())
        .ok_or_else(|| anyhow!("未找到可用的模型配置"))?;

    if config.auth.trim().is_empty() {
        return Err(anyhow!(
            "{} API Key 为空，请在 AI 模型页填写后重试",
            model_label(model_key)
        ));
    }

    if config.api_url.trim().is_empty() {
        return Err(anyhow!(
            "{} API URL 为空，请在 AI 模型页填写后重试",
            model_label(model_key)
        ));
    }

    if config.model_name.trim().is_empty() {
        return Err(anyhow!(
            "{} 模型名称为空，请在 AI 模型页填写后重试",
            model_label(model_key)
        ));
    }

    Ok(config)
}

async fn request_openai_compatible(
    client: &Client,
    config: &crate::store::ModelConfig,
    system_prompt: &str,
    original: &str,
) -> Result<String> {
    let body = json!({
        "model": config.model_name,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": original
            }
        ],
        "max_tokens": 220,
        "temperature": 0.4,
        "top_p": 0.9
    });

    let response = client
        .post(&config.api_url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", config.auth))
        .json(&body)
        .send()
        .await?;

    let status = response.status();
    let body_text = response.text().await?;
    let json: Value = serde_json::from_str(&body_text)
        .map_err(|_| anyhow!("模型服务返回了非 JSON 数据: {}", body_text))?;

    if !status.is_success() {
        let message = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("模型服务请求失败");
        return Err(anyhow!("{}", message));
    }

    if let Some(message) = json
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|v| v.as_str())
    {
        return Err(anyhow!("{}", message));
    }

    let translated = extract_openai_text(&json)
        .ok_or_else(|| anyhow!("模型服务返回格式异常，未读取到翻译内容"))?;

    Ok(cleanup_text(&translated))
}

async fn request_anthropic(
    client: &Client,
    config: &crate::store::ModelConfig,
    system_prompt: &str,
    original: &str,
) -> Result<String> {
    let body = json!({
        "model": config.model_name,
        "max_tokens": 220,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": original
            }
        ]
    });

    let response = client
        .post(&config.api_url)
        .header("Content-Type", "application/json")
        .header("x-api-key", &config.auth)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await?;

    let status = response.status();
    let body_text = response.text().await?;
    let json: Value = serde_json::from_str(&body_text)
        .map_err(|_| anyhow!("Anthropic 返回了非 JSON 数据: {}", body_text))?;

    if !status.is_success() {
        let message = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("Anthropic 请求失败");
        return Err(anyhow!("{}", message));
    }

    let translated = extract_anthropic_text(&json)
        .ok_or_else(|| anyhow!("Anthropic 返回格式异常，未读取到翻译内容"))?;

    Ok(cleanup_text(&translated))
}

pub async fn translate_with_gpt(app: &AppHandle, original: &str) -> Result<String> {
    let started = Instant::now();
    let raw = original.trim();
    if raw.is_empty() {
        return Ok(String::new());
    }

    let settings = crate::store::get_settings(app)?;
    let model_config = get_model_config(&settings)?;
    let system_prompt = get_system_prompt(
        &settings.translation_from,
        &settings.translation_to,
        &settings.translation_mode,
        settings.daily_mode,
    );

    let client = shared_http_client();
    let provider = model_config.provider.trim().to_lowercase();
    let request_started = Instant::now();

    let translated = if provider == "anthropic" {
        request_anthropic(client, &model_config, &system_prompt, raw).await?
    } else {
        request_openai_compatible(client, &model_config, &system_prompt, raw).await?
    };
    println!(
        "[perf] model_request provider={} elapsed_ms={}",
        provider,
        request_started.elapsed().as_millis()
    );
    println!(
        "[perf] translate_total elapsed_ms={}",
        started.elapsed().as_millis()
    );

    Ok(translated)
}
