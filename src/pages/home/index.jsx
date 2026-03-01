import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import { useStore } from '../../components/StoreProvider';
import { showError, showSuccess } from '../../utils/toast';

const STEPS = [
  {
    id: '01',
    title: '复制聊天内容',
    desc: '在游戏聊天框中选中或准备发送文本。',
  },
  {
    id: '02',
    title: '触发快捷键',
    desc: '按翻译快捷键，一键发起翻译。',
  },
  {
    id: '03',
    title: '自动回填',
    desc: '译文自动回填到当前输入框，可直接发送。',
  },
];

const hasTauriInvoke = () =>
  typeof window !== 'undefined' &&
  typeof window.__TAURI_INTERNALS__ !== 'undefined' &&
  typeof window.__TAURI_INTERNALS__.invoke === 'function';

export default function Home() {
  const { settings, updateSettings } = useStore();
  const [isToggling, setIsToggling] = useState(false);
  const [enabledState, setEnabledState] = useState(settings?.app_enabled ?? true);

  const isEnabled = enabledState;

  useEffect(() => {
    setEnabledState(settings?.app_enabled ?? true);
  }, [settings?.app_enabled]);

  const toggleAppEnabled = async () => {
    if (isToggling) {
      return;
    }
    const nextEnabled = !isEnabled;
    setEnabledState(nextEnabled);
    setIsToggling(true);
    try {
      if (hasTauriInvoke()) {
        const updated = await invoke('set_app_enabled', { enabled: nextEnabled });
        if (typeof updated?.app_enabled === 'boolean') {
          setEnabledState(updated.app_enabled);
        }
        await updateSettings(updated);
      } else {
        await updateSettings({ app_enabled: nextEnabled });
      }
      showSuccess(nextEnabled ? 'AutoGG 已启用' : 'AutoGG 已暂停');
    } catch (error) {
      setEnabledState(!nextEnabled);
      showError(`切换失败: ${error}`);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className='h-full grid grid-cols-1 xl:grid-cols-12 gap-x-5 gap-y-5 items-stretch'>
      <div className='h-full min-h-[248px] xl:col-span-4'>
        <TranslationDirectionCard />
      </div>

      <div className='h-full min-h-[248px] xl:col-span-4'>
        <HotkeyCard />
      </div>

      <motion.section
        className='dota-card rounded-2xl p-6 h-full min-h-[248px] xl:col-span-4'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}>
        <div className='text-base font-semibold text-zinc-900'>启用状态</div>
        <p className='text-sm text-zinc-500 mt-1'>控制 AutoGG 是否接收快捷键并执行翻译。</p>

        <div className='mt-4 rounded-xl border border-zinc-200 bg-white/80 p-3'>
          <div className='text-xs text-zinc-500'>软件状态</div>
          <div className='mt-1 text-sm font-semibold text-zinc-900'>
            {isEnabled ? '已启用（可正常翻译）' : '已暂停（不响应快捷键）'}
          </div>
        </div>

        <div className='mt-5 flex items-center justify-between'>
          <span className='text-sm text-zinc-500'>总开关</span>
          <button
            onClick={toggleAppEnabled}
            disabled={isToggling}
            className={`relative inline-flex h-10 w-[94px] items-center rounded-full px-1 transition-all ${
              isEnabled ? 'bg-blue-600' : 'bg-zinc-300'
            } ${isToggling ? 'opacity-70 cursor-not-allowed' : ''}`}>
            <span
              className={`inline-block h-8 w-[42px] transform rounded-full bg-white shadow transition-transform ${
                isEnabled ? 'translate-x-[43px]' : 'translate-x-0'
              }`}
            />
            <span className='absolute left-3 text-[11px] font-semibold text-white/90'>
              {isEnabled ? 'ON' : ''}
            </span>
            <span className='absolute right-3 text-[11px] font-semibold text-zinc-600'>
              {!isEnabled ? 'OFF' : ''}
            </span>
          </button>
        </div>
      </motion.section>

      <motion.section
        className='dota-card rounded-2xl p-6 xl:col-span-8'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}>
        <div className='flex items-center justify-between gap-3'>
          <h1 className='text-2xl font-bold text-zinc-900'>使用教程</h1>
          <div className='tool-pill'>3 步完成</div>
        </div>
        <p className='mt-2 text-sm text-zinc-500'>
          完成一次快捷键配置后，即可在 Dota2 对局中直接复制、翻译并回填聊天文本。
        </p>

        <div className='mt-5 grid grid-cols-1 md:grid-cols-3 gap-3'>
          {STEPS.map((step) => (
            <div key={step.id} className='tool-subcard rounded-xl p-4 h-full'>
              <div className='text-xs tracking-[0.16em] text-zinc-500'>{step.id}</div>
              <div className='mt-1 text-base font-semibold text-zinc-900'>{step.title}</div>
              <p className='mt-1 text-sm text-zinc-500 leading-relaxed'>{step.desc}</p>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section
        className='dota-card rounded-2xl p-6 xl:col-span-4'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='text-2xl font-bold text-zinc-900'>演示说明</h2>
          <div className='tool-pill'>示例</div>
        </div>
        <p className='mt-2 text-sm text-zinc-500'>以下为团战沟通场景下的翻译示例。</p>

        <div className='mt-4 space-y-3'>
          <div className='rounded-lg border border-zinc-200 bg-white p-3'>
            <div className='text-xs text-zinc-500 mb-1'>原文（中文）</div>
            <div className='text-base text-zinc-900'>别急着开团，等我 BKB 好了再打。</div>
          </div>
          <div className='text-center text-zinc-500 text-xs tracking-[0.14em]'>TRANSLATE</div>
          <div className='rounded-lg border border-zinc-200 bg-white p-3'>
            <div className='text-xs text-zinc-500 mb-1'>译文（英文）</div>
            <div className='text-base text-zinc-900'>Hold for now. Fight when my BKB is ready.</div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
