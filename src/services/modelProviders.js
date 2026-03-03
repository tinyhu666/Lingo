export const MODEL_OPTIONS = [
  { id: 'openai', name: 'OpenAI', modelName: 'gpt-4.1-mini', provider: 'openai', tag: '官方' },
  { id: 'deepseek', name: 'DeepSeek', modelName: 'deepseek-chat', provider: 'openai', tag: '官方' },
  { id: 'qwen', name: 'Qwen (阿里云)', modelName: 'qwen-plus', provider: 'openai', tag: '兼容' },
  { id: 'moonshot', name: 'Moonshot', modelName: 'moonshot-v1-8k', provider: 'openai', tag: '官方' },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    modelName: 'deepseek-ai/DeepSeek-V3',
    provider: 'openai',
    tag: '兼容',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    modelName: 'claude-3-5-haiku-latest',
    provider: 'anthropic',
    tag: '官方',
  },
  { id: 'custom', name: '自定义', modelName: 'your-model-name', provider: 'openai', tag: '自定义' },
];

export const PROVIDER_OPTIONS = [
  { id: 'openai', label: 'OpenAI Compatible（/v1/chat/completions）' },
  { id: 'anthropic', label: 'Anthropic Messages（/v1/messages）' },
];

const OPENAI_PATH = '/v1/chat/completions';
const ANTHROPIC_PATH = '/v1/messages';

export const normalizeProvider = (provider = '') => {
  const value = String(provider || '').trim().toLowerCase();
  return value === 'anthropic' ? 'anthropic' : 'openai';
};

export const normalizeApiUrlByProvider = (apiUrl = '', provider = 'openai') => {
  const normalizedProvider = normalizeProvider(provider);
  const url = String(apiUrl || '').trim();
  if (!url) {
    return normalizedProvider === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions';
  }

  if (normalizedProvider === 'anthropic' && url.endsWith(OPENAI_PATH)) {
    return `${url.slice(0, -OPENAI_PATH.length)}${ANTHROPIC_PATH}`;
  }

  if (normalizedProvider === 'openai' && url.endsWith(ANTHROPIC_PATH)) {
    return `${url.slice(0, -ANTHROPIC_PATH.length)}${OPENAI_PATH}`;
  }

  return url;
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: text };
  }
};

const validateConfig = (config) => {
  if (!config?.auth) {
    throw new Error('请输入 API Key');
  }
  if (!config?.api_url) {
    throw new Error('请输入 API URL');
  }
  if (!config?.model_name) {
    throw new Error('请输入模型名称');
  }
};

const testAnthropic = async (config) => {
  const response = await fetch(config.api_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.auth,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model_name,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'reply ok' }],
    }),
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.raw_text || 'Anthropic 连接失败');
  }

  const hasText = Array.isArray(data?.content)
    ? data.content.some((item) => item?.type === 'text')
    : false;

  if (!hasText) {
    throw new Error('Anthropic 返回格式异常');
  }
};

const testOpenAICompatible = async (config) => {
  const response = await fetch(config.api_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.auth}`,
    },
    body: JSON.stringify({
      model: config.model_name,
      messages: [{ role: 'user', content: 'reply ok' }],
      max_tokens: 8,
    }),
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.raw_text || '连接失败');
  }

  if (!Array.isArray(data?.choices) || !data.choices[0]?.message?.content) {
    throw new Error('返回格式异常，请检查 URL 是否为 chat/completions 接口');
  }
};

export const testModelConnection = async (config) => {
  const normalizedConfig = {
    ...config,
    provider: normalizeProvider(config?.provider),
    api_url: normalizeApiUrlByProvider(config?.api_url, config?.provider),
  };

  validateConfig(normalizedConfig);

  if (normalizedConfig.provider === 'anthropic') {
    await testAnthropic(normalizedConfig);
    return true;
  }

  await testOpenAICompatible(normalizedConfig);
  return true;
};
