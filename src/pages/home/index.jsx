import { motion } from 'framer-motion';
import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import EnableStatusCard from './components/EnableStatusCard';
import { ChatBubbleMessage, KeyboardAlt, Sparkles } from '../../icons';

const STEPS = [
  {
    id: '01',
    title: '复制聊天内容',
    desc: '在游戏聊天框中选中或准备发送文本，保持输入焦点不变。',
  },
  {
    id: '02',
    title: '触发快捷键',
    desc: '按翻译快捷键，一键调用服务端翻译并获取译文。',
  },
  {
    id: '03',
    title: '自动回填',
    desc: '译文自动写回当前输入框，可以直接发送，不必切出游戏。',
  },
];

export default function Home() {
  return (
    <div className='grid h-full grid-cols-12 gap-x-6 gap-y-12'>
      <div className='col-span-4 min-h-[252px]'>
        <TranslationDirectionCard />
      </div>

      <div className='col-span-4 min-h-[252px]'>
        <HotkeyCard />
      </div>

      <div className='col-span-4 min-h-[252px]'>
        <EnableStatusCard />
      </div>

      <motion.section
        className='dota-card tool-rise col-span-7 p-6'
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <KeyboardAlt className='tool-section-head__icon' />
              <h2 className='tool-card-title'>使用说明</h2>
            </div>
          </div>
        </div>
        <p className='tool-body tool-section-summary'>完成一次配置后，即可把翻译操作稳定压缩成三步，减少战局内停顿。</p>

        <div className='mt-6 grid grid-cols-3 gap-4'>
          {STEPS.map((step) => (
            <article key={step.id} className='tool-subcard tool-rise p-5'>
              <div className='tool-caption tracking-[0.16em]'>{step.id}</div>
              <h3 className='tool-card-title mt-2'>{step.title}</h3>
              <p className='tool-body mt-2'>{step.desc}</p>
            </article>
          ))}
        </div>
      </motion.section>

      <motion.section
        className='dota-card tool-rise col-span-5 p-6'
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <ChatBubbleMessage className='tool-section-head__icon' />
              <h2 className='tool-card-title'>演示说明</h2>
            </div>
          </div>
          <div className='tool-pill'>示例</div>
        </div>
        <p className='tool-body tool-section-summary'>以下为游戏内沟通场景下的翻译示例，强调清晰、短句和可直接发送。</p>

        <div className='mt-5 space-y-4'>
          <div className='tool-subcard p-4'>
            <div className='flex items-center gap-2 text-zinc-800'>
              <KeyboardAlt className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>原文（中文）</span>
            </div>
            <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>别急着开团，等我 BKB 好了再打。</div>
          </div>

          <div className='flex items-center gap-3 px-1'>
            <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
            <div className='tool-pill'>翻译结果</div>
            <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
          </div>

          <div className='tool-subcard p-4'>
            <div className='flex items-center gap-2 text-zinc-800'>
              <Sparkles className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>译文（英文）</span>
            </div>
            <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>Hold for now. Fight when my BKB is ready.</div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
