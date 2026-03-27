create table if not exists public.app_runtime_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_app_runtime_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists app_runtime_config_set_updated_at on public.app_runtime_config;

create trigger app_runtime_config_set_updated_at
before update on public.app_runtime_config
for each row
execute function public.set_app_runtime_config_updated_at();

alter table public.app_runtime_config enable row level security;

insert into public.app_runtime_config (key, value)
values (
  'translation_proxy',
  jsonb_build_object(
    'enabled', true,
    'provider', 'openai-compatible',
    'api_url', 'https://api.siliconflow.cn/v1/chat/completions',
    'model_name', 'deepseek-ai/DeepSeek-V3.2',
    'api_key_secret_name', 'MODEL_API_KEY',
    'timeout_ms', 12000,
    'max_tokens', 96,
    'temperature', 0.2
  )
)
on conflict (key) do nothing;
