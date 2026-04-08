# Translation Service Runtime Config

The desktop client no longer stores model selection, upstream API URLs, or API keys.
All translation requests go through the Supabase Edge Function at `/translate`.

## Runtime Flow

1. The desktop client sends translation requests to `/translate`.
2. The Edge Function tries to load `translation_proxy` from `public.app_runtime_config`.
3. The Edge Function reads the real upstream API key from function secrets by using
   `api_key_secret_name` from the runtime config.
4. If the database config is unavailable, the function falls back to environment-based
   configuration such as `MODEL_PROVIDER`, `MODEL_API_URL`, `MODEL_NAME`, and
   `MODEL_API_KEY_SECRET_NAME`.

## One-Time Setup

Apply the migration at
`supabase/migrations/20260317160000_translation_runtime_config.sql`.

This migration creates `public.app_runtime_config` and seeds a default
`translation_proxy` row.

Example payload:

```json
{
  "enabled": true,
  "provider": "openai-compatible",
  "api_url": "https://api.siliconflow.cn/v1/chat/completions",
  "model_name": "deepseek-ai/DeepSeek-V3.2",
  "api_key_secret_name": "MODEL_API_KEY",
  "timeout_ms": 12000,
  "max_tokens": 96,
  "temperature": 0.2
}
```

The same example is also stored in
`supabase/translation-runtime.example.json`.

If you still use the Supabase Edge Function path instead of the standalone
translate proxy, keep its primary model aligned with the proxy recommendation:
use `deepseek-ai/DeepSeek-V3.2` for the main translation model. This legacy path
does not currently expose the proxy's dual-model fast-lane routing, so it
should not be treated as the place to tune short-text latency.

## Required Secrets

For the GitHub deploy workflow, configure these repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MODEL_API_KEY`

Also configure these repository variables:

- `SUPABASE_PROJECT_ID`
- `TRANSLATION_RUNTIME_CONFIG_JSON` (optional)

The deploy workflow syncs these secrets into the Edge Function runtime.

## Switching Models

There are two supported ways to switch models without shipping a new client:

1. Update the GitHub variable `TRANSLATION_RUNTIME_CONFIG_JSON` and rerun
   `Deploy Translate Proxy`.
2. Update `public.app_runtime_config` directly in Supabase.

Only the runtime config changes in this flow. The API key remains in secrets.

## Rotating API Keys

If you only need to rotate the upstream key, keep
`translation_proxy.api_key_secret_name` unchanged and update the matching secret
value.

If you want to switch to a different secret name, update
`translation_proxy.api_key_secret_name` to point at the new secret.

## Debugging

Send a `GET` request to `/translate` to inspect the active non-sensitive runtime
summary. The response includes:

- `provider`
- `model`
- `api_url`
- `config_source`
- `updated_at`

## Recovering a Paused Supabase Project

Free-tier Supabase projects can be paused automatically after inactivity. When that
happens, rerun the GitHub Actions workflow `Deploy Translate Proxy`.

The workflow now:

1. Detects whether `SUPABASE_PROJECT_ID` is paused.
2. Requests a restore through the Supabase management API when needed.
3. Waits for the project to come back online.
4. Re-syncs function secrets, redeploys `translate`, and writes
   `public.app_runtime_config` again.

This means the same deployment workflow doubles as the backend recovery path, so
you do not need a separate manual runbook when the hosted translation service is
paused.
