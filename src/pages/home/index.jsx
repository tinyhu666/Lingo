import { motion } from 'framer-motion';
import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import EnableStatusCard from './components/EnableStatusCard';

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

export default function Home() {
  return (
    <div className='h-full grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch'>
      <div className='h-full min-h-[248px] xl:col-span-4'>
        <TranslationDirectionCard />
      </div>

      <div className='h-full min-h-[248px] xl:col-span-4'>
        <HotkeyCard />
      </div>

      <div className='h-full min-h-[248px] xl:col-span-4'>
        <EnableStatusCard />
      </div>

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
