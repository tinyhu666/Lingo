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
`proxy_overhead_ms`, `model_route`, `prompt_variant`, `style_profile`,
`effective_max_tokens`, `effective_temperature`, and `trace_id`, so you can tell
whether a request was slow because of model execution or proxy/interface overhead,
whether it came from model execution, in-memory hot cache, or a shared in-flight
request, and which adaptive request budget was actually used.

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
and fall back to the primary model on failure. By default, both short
`translate` and short `rewrite` requests can be routed through fast lane as long
as the selected style profile allows it.

## SiliconFlow Model Recommendation

For SiliconFlow-backed translation, avoid using `deepseek-ai/DeepSeek-R1` or
`DeepSeek-R1-Distill-*` as the primary translation model. They are reasoning
models and usually add latency without improving short chat-style translation.
As of March 27, 2026, SiliconFlow's official docs show `deepseek-ai/DeepSeek-V3.2`,
`Qwen/Qwen3-32B`, and `Qwen/Qwen3-14B` as supported chat-completions model IDs;
I did not find a published `Qwen3.5` model ID in the current official docs.

Recommended split for Lingo:

- Primary model: `deepseek-ai/DeepSeek-V3.2`
- Fast lane model: `Qwen/Qwen3-14B`

If this is still not strong enough for your game terminology, stay on the same
primary model and move the fast lane to a larger Qwen3-tier model that is
actually listed in SiliconFlow's official model catalog. In Lingo's live
testing, `Qwen/Qwen3-32B` was strong enough but too heavy for the fast-lane
role: short requests repeatedly waited for the fast model and then returned via
`fast-fallback`, which erased most latency gains. `Qwen/Qwen3-14B` keeps the
Qwen3 family while fitting the fast-lane budget more realistically. Do not
switch the primary model to `R1` unless you specifically want slower
reasoning-heavy behavior.

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
- `CADDY_DOMAIN`
- `MODEL_API_KEY`
- `MODEL_PROVIDER`
- `MODEL_API_URL`
- `MODEL_NAME`

`server/translate-proxy/Caddyfile` now reads `{$CADDY_DOMAIN}` from the
container environment, so you can safely sync repository updates to the server
without overwriting your real public domain back to `translate.example.com`.

If you want to print the repository's recommended SiliconFlow payload instead of
copying the example file by hand, run:

```bash
npm run proxy:print-siliconflow-config
```

To print a ready-to-run `curl` for your deployed proxy:

```bash
npm run proxy:print-siliconflow-config -- --format=curl --url=https://your-domain.example.com
```

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
    "model_name": "deepseek-ai/DeepSeek-V3.2",
    "api_key_env_name": "MODEL_API_KEY",
    "timeout_ms": 12000,
    "max_tokens": 96,
    "temperature": 0.2,
    "fast_lane": {
      "enabled": true,
      "provider": "openai-compatible",
      "api_url": "https://api.siliconflow.cn/v1/chat/completions",
      "model_name": "Qwen/Qwen3-14B",
      "api_key_env_name": "MODEL_API_KEY",
      "timeout_ms": 5000,
      "max_tokens": 48,
      "temperature": 0.1,
      "max_text_length": 72,
      "allowed_prompt_variants": ["translate", "rewrite"]
    }
  }'
```

The server writes the result into `data/runtime-config.json`, so the settings
survive container restarts.

This repository's current latency-first recommendation is the same payload:
`DeepSeek-V3.2` stays as the primary model, and `Qwen/Qwen3-14B`
handles short `translate` and `rewrite` requests through fast lane.

For a repeatable feasibility check against your live proxy, run:

```bash
npm run proxy:diagnose -- --url=https://your-domain.example.com --token=YOUR_BACKEND_PUBLIC_KEY --runs=5
```

The script now prints per-run rows plus scenario summaries with `p50`, `p95`,
`fast_lane_rate`, `fast_fallback_rate`, `cache_hit_rate`, and a coarse
`assessment=` conclusion, so you can tell whether the current fast-lane model is
actually viable.

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
npm run proxy:smoke
```
