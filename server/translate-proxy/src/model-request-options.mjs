export const modelRequestOptions = (config, maxTokens, temperature) => {
  const hostname = new URL(config.api_url).hostname.toLowerCase();
  if (hostname === 'open.bigmodel.cn' && config.model_name === 'glm-5.3-flash') {
    // GLM 5.3 cannot disable thinking. Its token budget also covers reasoning.
    return {
      max_tokens: Math.max(maxTokens, 1024),
      temperature: 1,
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    };
  }
  return {
    max_tokens: maxTokens,
    temperature,
    ...(hostname === 'api.deepseek.com' && config.model_name.startsWith('deepseek-v4-')
      ? { thinking: { type: 'disabled' } }
      : {}),
  };
};
