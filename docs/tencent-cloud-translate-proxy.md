# Tencent Cloud Translate Proxy

This document describes how to move Lingo's translation model and upstream API
configuration to your own Tencent Cloud Lightweight Application Server.

## What This Replaces

The desktop client already talks to a backend by sending `POST /translate`.
The new proxy keeps that contract and removes the dependency on Supabase for
runtime translation routing.

## Directory

The deployable service lives in:

- `server/translate-proxy/`

It provides:

- `GET /healthz` for health checks
- `GET /translate` for non-sensitive runtime summary
- `POST /translate` for translation
- `GET /admin/runtime-config` for current server-side config
- `PUT /admin/runtime-config` for changing model/API routing without shipping a new client

`POST /translate` responses also include lightweight diagnostics such as
`response_source`, `attempt_count`, `latency_ms`, `model_latency_ms`,
`model_route`, `prompt_variant`, `effective_max_tokens`,
`effective_temperature`, and `trace_id`, so you can tell whether a request came from model execution,
in-memory hot cache, or a shared in-flight request, and which adaptive request
budget was actually used.

## Server-Side Config Model

Sensitive values stay in server environment variables.
Mutable runtime settings are stored in `data/runtime-config.json`.
The proxy keeps a short in-memory cache for both runtime config reads and recent
translation results to reduce repeat-request latency without changing deploy
workflow.
It also adapts prompt length and generation budget based on text length and
whether the request is a translation or a same-language rewrite, so first-hit
latency stays lower without requiring separate client logic.
If you need a lower-latency model for short new messages, you can optionally
enable `fast_lane`; the proxy will try that model first for eligible requests
and fall back to the primary model on failure.

Suggested split:

- Environment variables:
  - `ADMIN_TOKEN`
  - `BACKEND_PUBLIC_KEY`
  - `MODEL_API_KEY`
- Runtime JSON:
  - `enabled`
  - `provider`
  - `api_url`
  - `model_name`
  - `api_key_env_name`
  - `timeout_ms`
  - `max_tokens`
  - `temperature`
  - `fast_lane` (optional)

## Deploy On Tencent Cloud Lightweight Server

1. Install Docker and the compose plugin.

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "$USER"
```

2. Copy `server/translate-proxy/` to the server.

3. Create the runtime files.

```bash
cd server/translate-proxy
cp .env.example .env
cp runtime-config.example.json data/runtime-config.json
```

4. Edit `.env`.

At minimum set:

- `ADMIN_TOKEN`
- `BACKEND_PUBLIC_KEY`
- `MODEL_API_KEY`
- `MODEL_PROVIDER`
- `MODEL_API_URL`
- `MODEL_NAME`

5. Edit `Caddyfile`.

Replace `translate.example.com` with your real domain.

6. Start the service.

```bash
docker compose up -d --build
```

7. Open firewall ports `80` and `443` in Tencent Cloud.

8. Point your domain DNS to the lightweight server public IP.

9. Verify.

```bash
curl https://your-domain.example.com/healthz
curl https://your-domain.example.com/translate
```

## Update Runtime Config Without Redeploy

Use the admin endpoint:

```bash
curl -X PUT "https://your-domain.example.com/admin/runtime-config" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "enabled": true,
    "provider": "openai-compatible",
    "api_url": "https://api.siliconflow.cn/v1/chat/completions",
    "model_name": "deepseek-ai/DeepSeek-V3",
    "api_key_env_name": "MODEL_API_KEY",
    "timeout_ms": 12000,
    "max_tokens": 96,
    "temperature": 0.2,
    "fast_lane": {
      "enabled": false,
      "provider": "openai-compatible",
      "api_url": "https://api.siliconflow.cn/v1/chat/completions",
      "model_name": "",
      "api_key_env_name": "MODEL_API_KEY",
      "timeout_ms": 5000,
      "max_tokens": 48,
      "temperature": 0.1,
      "max_text_length": 72,
      "allowed_prompt_variants": ["translate"]
    }
  }'
```

The server writes the result into `data/runtime-config.json`, so the settings
survive container restarts.

## Connect Lingo To Tencent Cloud

After the proxy is online, point release builds to it:

1. Set GitHub Actions variable `LINGO_BACKEND_URL=https://your-domain.example.com`
2. Set GitHub secret or variable `LINGO_BACKEND_ANON_KEY` to the same value as `BACKEND_PUBLIC_KEY`
3. Remove `SUPABASE_PROJECT_ID` from release defaults if you do not want fallback to Supabase
4. Build and publish a new desktop release

## Local Verification

Run the included smoke test:

```bash
cd server/translate-proxy
npm run smoke
```
