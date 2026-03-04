import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [draftConfig, setDraftConfig] = useState({
    auth: '',
    api_url: '',
    model_name: '',
  });
  const debounceTimerRef = useRef(null);
  const pendingPatchRef = useRef({});

  useEffect(() => {
    if (settings?.model_type) {
      setActiveModel(settings.model_type);
    }
  }, [settings?.model_type]);

  const activeConfig = useMemo(() => {
    const allConfigs = settings?.model_configs || {};
    return allConfigs[activeModel] || {};
  }, [settings?.model_configs, activeModel]);

  const patchActiveConfig = useCallback(
    async (patch) => {
      await updateSettings((current) => {
        const allConfigs = current?.model_configs || {};
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

        return payload;
      });
    },
    [activeModel, updateSettings],
  );

  const flushDraftPatch = useCallback(async () => {
    const pendingPatch = pendingPatchRef.current;
    if (!Object.keys(pendingPatch).length) {
      return;
    }

    pendingPatchRef.current = {};
    await patchActiveConfig(pendingPatch);
  }, [patchActiveConfig]);

  const scheduleDraftPatch = useCallback(
    (field, value) => {
      setDraftConfig((prev) => ({ ...prev, [field]: value }));
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        [field]: value,
      };

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void flushDraftPatch();
      }, 400);
    },
    [flushDraftPatch],
  );

  const commitDraftImmediately = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    void flushDraftPatch();
  }, [flushDraftPatch]);

  useEffect(() => {
    setDraftConfig({
      auth: activeConfig?.auth || '',
      api_url: activeConfig?.api_url || '',
      model_name: activeConfig?.model_name || '',
    });
  }, [activeModel, activeConfig?.auth, activeConfig?.api_url, activeConfig?.model_name]);

  useEffect(
    () => () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    },
    [],
  );

  const selectModel = async (modelId) => {
    await flushDraftPatch();
    setActiveModel(modelId);
    await updateSettings({ model_type: modelId });
  };

  const updateProvider = async (provider) => {
    await flushDraftPatch();
    const normalizedProvider = normalizeProvider(provider);
    const normalizedUrl = normalizeApiUrlByProvider(activeConfig?.api_url, normalizedProvider);
    await patchActiveConfig({
      provider: normalizedProvider,
      api_url: normalizedUrl,
    });
  };

  const verifyConnection = async () => {
    await flushDraftPatch();
    setTesting(true);
    try {
      const ok = await testModelConnection({
        ...activeConfig,
        auth: draftConfig.auth,
        api_url: draftConfig.api_url,
        model_name: draftConfig.model_name,
      });
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
    <div className='h-full flex flex-col gap-6'>
      <motion.section
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <h1 className='tool-page-title mb-4'>AutoGG 模型设置</h1>
        <p className='tool-body text-zinc-600'>
          可为不同厂商分别填写 API Key、URL、模型名称。翻译时按当前选中厂商发起请求。
        </p>
      </motion.section>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <motion.section
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}>
          <div className='flex items-center gap-3 mb-6'>
            <Crown className='w-5 h-5 stroke-zinc-500' />
            <h2 className='tool-card-title'>模型厂商</h2>
          </div>

          <div className='space-y-3'>
            {MODEL_OPTIONS.map((model) => {
              const active = activeModel === model.id;
              return (
                <button
                  key={model.id}
                  type='button'
                  onClick={() => selectModel(model.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    active
                      ? 'border-blue-300 bg-blue-50/70 shadow-[0_6px_16px_rgba(37,99,235,0.12)]'
                      : 'border-zinc-200 hover:bg-zinc-50'
                  }`}>
                  <div className='min-w-0 text-left'>
                    <div className='tool-control-text text-zinc-700 truncate'>{model.name}</div>
                    <div className='tool-caption mt-1 truncate'>{model.modelName}</div>
                  </div>

                  <div className='flex items-center gap-2 pl-3'>
                    <span className='tool-chip'>
                      <Sparkles className='w-3.5 h-3.5 stroke-emerald-500' />
                      <span className='tool-caption text-emerald-600'>{model.tag}</span>
                    </span>

                    <span
                      className={`w-4 h-4 rounded-full border transition-all ${
                        active ? 'border-blue-600 bg-blue-600' : 'border-zinc-300'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </motion.section>

        <motion.section
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}>
          <div className='flex items-center gap-3 mb-6'>
            <Server className='w-5 h-5 stroke-zinc-500' />
            <h2 className='tool-card-title'>API 配置（{getModelName(activeModel)}）</h2>
          </div>

          <div className='space-y-4'>
            <div>
              <label className='tool-label block'>API Key</label>
              <input
                type='password'
                value={draftConfig.auth}
                onChange={(event) => scheduleDraftPatch('auth', event.target.value)}
                onBlur={commitDraftImmediately}
                className='tool-input'
                placeholder='输入 API Key'
              />
            </div>

            <div>
              <label className='tool-label block'>API URL</label>
              <input
                type='text'
                value={draftConfig.api_url}
                onChange={(event) => scheduleDraftPatch('api_url', event.target.value)}
                onBlur={commitDraftImmediately}
                className='tool-input'
                placeholder={
                  normalizeProvider(activeConfig?.provider) === 'anthropic'
                    ? '例如：https://api.anthropic.com/v1/messages'
                    : '例如：https://api.openai.com/v1/chat/completions'
                }
              />
            </div>

            <div>
              <label className='tool-label block'>Model Name</label>
              <input
                type='text'
                value={draftConfig.model_name}
                onChange={(event) => scheduleDraftPatch('model_name', event.target.value)}
                onBlur={commitDraftImmediately}
                className='tool-input'
                placeholder='例如：gpt-4.1-mini'
              />
            </div>

            <div>
              <label className='tool-label block'>Provider 类型</label>
              <select
                value={normalizeProvider(activeConfig?.provider)}
                onChange={(event) => updateProvider(event.target.value)}
                className='tool-input'>
                {PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>

              <p className='tool-caption text-zinc-400 mt-2'>切换后会自动修正常见默认端点，避免接口不匹配。</p>
            </div>

            <div className='pt-2 flex items-center justify-between'>
              <p className='tool-caption text-zinc-400'>
                当前翻译使用：
                <span className='font-medium text-zinc-500'> {getModelName(activeModel)}</span>
              </p>

              <button
                type='button'
                onClick={verifyConnection}
                disabled={testing}
                className={`tool-btn-primary px-4 py-2 text-sm ${
                  testing ? 'opacity-70 cursor-not-allowed' : ''
                }`}>
                {testing ? '测试中...' : '测试连接'}
              </button>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
