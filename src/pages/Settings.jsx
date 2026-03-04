import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Server, Crown, Sparkles } from '../icons';
import { useStore } from '../components/StoreProvider';
import {
  MODEL_OPTIONS,
  PROVIDER_OPTIONS,
  normalizeApiUrlByProvider,
  normalizeProvider,
  testModelConnection,
} from '../services/modelProviders';
import { showSuccess, showError } from '../utils/toast';

const getModelName = (id) => MODEL_OPTIONS.find((item) => item.id === id)?.name || id;

export default function Settings() {
  const { settings, updateSettings } = useStore();
  const [activeModel, setActiveModel] = useState(settings?.model_type || 'openai');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (settings?.model_type) {
      setActiveModel(settings.model_type);
    }
  }, [settings?.model_type]);

  const activeConfig = useMemo(() => {
    const allConfigs = settings?.model_configs || {};
    return allConfigs[activeModel] || {};
  }, [settings?.model_configs, activeModel]);

  const currentProvider = normalizeProvider(activeConfig?.provider);
  const normalizedUrlPreview = normalizeApiUrlByProvider(activeConfig?.api_url, currentProvider);

  const selectModel = async (modelId) => {
    setActiveModel(modelId);
    await updateSettings({ model_type: modelId });
  };

  const patchActiveConfig = async (patch) => {
    const allConfigs = settings?.model_configs || {};
    const nextModelConfigs = {
      ...allConfigs,
      [activeModel]: {
        ...(allConfigs[activeModel] || {}),
        ...patch,
      },
    };

    const payload = { model_configs: nextModelConfigs };

    if (activeModel === 'custom') {
      payload.custom_model = nextModelConfigs.custom;
    }

    await updateSettings(payload);
  };

  const updateProvider = async (provider) => {
    const normalized = normalizeProvider(provider);
    const normalizedUrl = normalizeApiUrlByProvider(activeConfig?.api_url, normalized);
    await patchActiveConfig({
      provider: normalized,
      api_url: normalizedUrl,
    });
  };

  const verifyConnection = async () => {
    setTesting(true);
    try {
      const ok = await testModelConnection(activeConfig);
      if (ok) {
        showSuccess('API 连接测试成功');
      }
    } catch (error) {
      showError(error.message || '连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className='h-full flex flex-col gap-5 ui-animate-in'>
      <motion.section
        className='ui-card ui-card-glass rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <h1 className='ui-page-title'>AI 模型配置</h1>
        <p className='ui-body mt-2'>按厂商独立维护认证参数，切换后立即作用于剪贴板翻译链路。</p>
      </motion.section>

      <div className='grid grid-cols-1 gap-5 xl:grid-cols-[292px_1fr] min-h-0 flex-1'>
        <motion.section
          className='ui-card rounded-2xl p-4 space-y-3'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}>
          <div className='flex items-center gap-2 px-2'>
            <Crown className='h-5 w-5 text-[#a8b6d7]' />
            <h2 className='ui-card-title'>模型厂商</h2>
          </div>
          <div className='space-y-2'>
            {MODEL_OPTIONS.map((model) => {
              const active = activeModel === model.id;
              return (
                <button
                  key={model.id}
                  type='button'
                  onClick={() => selectModel(model.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                    active
                      ? 'ui-state-enabled bg-[#283451]'
                      : 'border-[#36445f] bg-[#1d2536] hover:border-[#4c628a]'
                  }`}>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='min-w-0'>
                      <div className='ui-control-text truncate'>{model.name}</div>
                      <div className='ui-caption mt-1 truncate'>{model.modelName}</div>
                    </div>
                    <span className='ui-chip shrink-0'>{model.tag}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.section>

        <motion.section
          className='ui-card rounded-2xl p-5 space-y-4 overflow-auto'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}>
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Server className='h-5 w-5 text-[#a8b6d7]' />
              <h2 className='ui-card-title'>配置详情（{getModelName(activeModel)}）</h2>
            </div>
            <span className='ui-chip'>Provider：{currentProvider}</span>
          </div>

          <div className='grid grid-cols-1 gap-4 2xl:grid-cols-2'>
            <section className='ui-soft-card p-4 space-y-3'>
              <h3 className='ui-card-title text-[15px]'>认证</h3>
              <div>
                <label className='tool-label'>API Key</label>
                <input
                  type='password'
                  value={activeConfig?.auth || ''}
                  onChange={(event) => patchActiveConfig({ auth: event.target.value })}
                  className='ui-control'
                  placeholder='输入 API Key'
                />
              </div>
            </section>

            <section className='ui-soft-card p-4 space-y-3'>
              <h3 className='ui-card-title text-[15px]'>Provider</h3>
              <div>
                <label className='tool-label'>接口类型</label>
                <select
                  value={currentProvider}
                  onChange={(event) => updateProvider(event.target.value)}
                  className='ui-control'>
                  {PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className='ui-caption'>
                切换 Provider 后会自动修正 URL 后缀，避免 `/v1/chat/completions` 与 `/v1/messages` 不匹配。
              </div>
            </section>

            <section className='ui-soft-card p-4 space-y-3 2xl:col-span-2'>
              <h3 className='ui-card-title text-[15px]'>端点与模型</h3>
              <div className='grid grid-cols-1 gap-3 2xl:grid-cols-2'>
                <div>
                  <label className='tool-label'>API URL</label>
                  <input
                    type='text'
                    value={activeConfig?.api_url || ''}
                    onChange={(event) => patchActiveConfig({ api_url: event.target.value })}
                    className='ui-control'
                    placeholder={
                      currentProvider === 'anthropic'
                        ? '例如：https://api.anthropic.com/v1/messages'
                        : '例如：https://api.openai.com/v1/chat/completions'
                    }
                  />
                </div>

                <div>
                  <label className='tool-label'>Model Name</label>
                  <input
                    type='text'
                    value={activeConfig?.model_name || ''}
                    onChange={(event) => patchActiveConfig({ model_name: event.target.value })}
                    className='ui-control'
                    placeholder='例如：gpt-4.1-mini'
                  />
                </div>
              </div>
            </section>
          </div>

          <section className='ui-soft-card p-4 space-y-3'>
            <div className='flex items-center gap-2'>
              <Sparkles className='h-5 w-5 text-[#a8b6d7]' />
              <h3 className='ui-card-title text-[15px]'>当前生效摘要</h3>
            </div>

            <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
              <div className='ui-soft-card p-3'>
                <div className='ui-caption'>模型厂商</div>
                <div className='ui-control-text mt-1'>{getModelName(activeModel)}</div>
              </div>
              <div className='ui-soft-card p-3'>
                <div className='ui-caption'>Provider</div>
                <div className='ui-control-text mt-1'>{currentProvider}</div>
              </div>
              <div className='ui-soft-card p-3'>
                <div className='ui-caption'>URL 规范化</div>
                <div className='ui-control-text mt-1 truncate' title={normalizedUrlPreview}>
                  {normalizedUrlPreview || '未设置'}
                </div>
              </div>
            </div>

            <div className='flex justify-end pt-1'>
              <button
                type='button'
                onClick={verifyConnection}
                disabled={testing}
                className={`ui-btn-primary ${testing ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {testing ? '测试中...' : '测试连接'}
              </button>
            </div>
          </section>
        </motion.section>
      </div>
    </div>
  );
}
