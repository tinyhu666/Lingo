import { motion } from 'framer-motion';
import { Server, Crown, Sparkles } from '../icons';
import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../components/StoreProvider';
import { showSuccess, showError } from '../utils/toast';

const MODEL_OPTIONS = [
  {
    id: 'openai',
    name: 'OpenAI',
    modelName: 'gpt-4.1-mini',
    provider: 'openai',
    tag: '官方',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    modelName: 'deepseek-chat',
    provider: 'openai',
    tag: '官方',
  },
  {
    id: 'qwen',
    name: 'Qwen (阿里云)',
    modelName: 'qwen-plus',
    provider: 'openai',
    tag: '兼容',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    modelName: 'moonshot-v1-8k',
    provider: 'openai',
    tag: '官方',
  },
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
  {
    id: 'custom',
    name: '自定义',
    modelName: 'your-model-name',
    provider: 'openai',
    tag: '自定义',
  },
];

const parseJsonResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw_text: text };
  }
};

const testConnection = async (config) => {
  if (!config?.auth) {
    throw new Error('请输入 API Key');
  }
  if (!config?.api_url) {
    throw new Error('请输入 API URL');
  }
  if (!config?.model_name) {
    throw new Error('请输入模型名称');
  }

  if (config.provider === 'anthropic') {
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

    return true;
  }

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

  return true;
};

export default function Settings() {
  const { settings, updateSettings } = useStore();
  const [activeModel, setActiveModel] = useState(settings?.model_type || 'openai');
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  useEffect(() => {
    if (settings?.model_type) {
      setActiveModel(settings.model_type);
    }
  }, [settings?.model_type]);

  const activeConfig = useMemo(() => {
    if (!settings?.model_configs) {
      return {};
    }
    return settings.model_configs[activeModel] || {};
  }, [settings?.model_configs, activeModel]);

  const handleModelChange = async (model) => {
    setActiveModel(model);
    await updateSettings({ model_type: model });
  };

  const patchActiveConfig = async (patch) => {
    const nextConfigs = {
      ...(settings?.model_configs || {}),
      [activeModel]: {
        ...(settings?.model_configs?.[activeModel] || {}),
        ...patch,
      },
    };

    const nextPayload = {
      model_configs: nextConfigs,
    };

    if (activeModel === 'custom') {
      nextPayload.custom_model = nextConfigs.custom;
    }

    await updateSettings(nextPayload);
  };

  return (
    <div className='h-full flex flex-col gap-6'>
      <motion.div
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <h1 className='text-2xl font-bold text-zinc-900 mb-4'>AutoGG 模型设置</h1>
        <p className='text-zinc-600'>
          可为不同厂商分别填写 API Key、URL、模型名称。翻译时按当前选中厂商发起请求。
        </p>
      </motion.div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <motion.div
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}>
          <div className='flex items-center gap-3 text-sm text-zinc-500 mb-6'>
            <Crown className='w-5 h-5 stroke-zinc-500' />
            模型厂商
          </div>
          <div className='space-y-3'>
            {MODEL_OPTIONS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelChange(model.id)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  activeModel === model.id
                    ? 'border-blue-300 bg-blue-50/70 shadow-[0_6px_16px_rgba(37,99,235,0.12)]'
                    : 'border-zinc-200 hover:bg-zinc-50'
                }`}>
                <div className='min-w-0 text-left'>
                  <div className='text-sm font-semibold text-zinc-700 truncate'>{model.name}</div>
                  <div className='mt-1 text-xs text-zinc-500 truncate'>{model.modelName}</div>
                </div>
                <div className='flex items-center gap-2 pl-3'>
                  <div className='tool-chip'>
                    <Sparkles className='w-3.5 h-3.5 stroke-emerald-500' />
                    <span className='text-xs text-emerald-600'>{model.tag}</span>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border transition-all ${
                      activeModel === model.id
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-zinc-300'
                    }`}
                  />
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}>
          <div className='flex items-center gap-3 text-sm text-zinc-500 mb-6'>
            <Server className='w-5 h-5 stroke-zinc-500' />
            API 配置 ({MODEL_OPTIONS.find((item) => item.id === activeModel)?.name || activeModel})
          </div>

          <div className='space-y-4'>
            <div>
              <label className='tool-label block'>API Key</label>
              <input
                type='password'
                value={activeConfig?.auth || ''}
                onChange={(e) => patchActiveConfig({ auth: e.target.value })}
                className='tool-input'
                placeholder='输入 API Key'
              />
            </div>

            <div>
              <label className='tool-label block'>API URL</label>
              <input
                type='text'
                value={activeConfig?.api_url || ''}
                onChange={(e) => patchActiveConfig({ api_url: e.target.value })}
                className='tool-input'
                placeholder='例如：https://api.openai.com/v1/chat/completions'
              />
            </div>

            <div>
              <label className='tool-label block'>Model Name</label>
              <input
                type='text'
                value={activeConfig?.model_name || ''}
                onChange={(e) => patchActiveConfig({ model_name: e.target.value })}
                className='tool-input'
                placeholder='例如：gpt-4.1-mini'
              />
            </div>

            <div>
              <label className='tool-label block'>Provider 类型</label>
              <select
                value={activeConfig?.provider || 'openai'}
                disabled={activeModel !== 'custom'}
                onChange={(e) => patchActiveConfig({ provider: e.target.value })}
                className='tool-input disabled:opacity-50'>
                <option value='openai'>OpenAI Compatible</option>
                <option value='anthropic'>Anthropic Messages</option>
              </select>
              <p className='text-xs text-zinc-400 mt-2'>
                非自定义厂商已内置 provider 类型；自定义可手动切换。
              </p>
            </div>

            <div className='pt-2 flex items-center justify-between'>
              <p className='text-xs text-zinc-400'>
                当前翻译使用：
                <span className='font-medium text-zinc-500'> {MODEL_OPTIONS.find((item) => item.id === activeModel)?.name || activeModel}</span>
              </p>
              <button
                onClick={async () => {
                  setIsTestingConnection(true);
                  try {
                    const ok = await testConnection(activeConfig);
                    if (ok) {
                      showSuccess('API 连接测试成功');
                    }
                  } catch (error) {
                    showError(error.message || '连接测试失败');
                  } finally {
                    setIsTestingConnection(false);
                  }
                }}
                disabled={isTestingConnection}
                className={`tool-btn-primary px-4 py-2 text-sm ${
                  isTestingConnection
                    ? 'opacity-70 cursor-not-allowed'
                    : ''
                }`}>
                {isTestingConnection ? '测试中...' : '测试连接'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
