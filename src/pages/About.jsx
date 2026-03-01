import { motion } from 'framer-motion';
import { GamingPad, Globe } from '../icons';
import DeveloperNote from '../components/DeveloperNote';

export default function About() {
  const currentVersion = 'V0.1.0';

  return (
    <div className='h-full flex flex-col gap-6'>
      <motion.div
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <h1 className='text-2xl font-bold text-zinc-900 mb-4'>关于 AutoGG</h1>
        <p className='text-zinc-600'>
          当前版本：{currentVersion}。Powerby tinyhu。AutoGG 聚焦 Dota2 游戏内即时沟通翻译，支持全局快捷键、剪贴板翻译回填以及多厂商大模型 API。
        </p>
      </motion.div>

      <div className='flex-1 grid grid-cols-1 md:grid-cols-3 gap-6'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}>
          <DeveloperNote />
        </motion.div>

        <motion.div
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}>
          <div className='flex items-center gap-3 text-sm text-zinc-500'>
            <GamingPad className='w-6 h-6 stroke-zinc-500' />
            Dota2 场景优化
          </div>
          <div className='mt-4 text-sm text-zinc-400'>
            针对游戏内对话做短句化输出，尽量保留技能、装备和指挥术语，减少“翻译腔”。
          </div>
        </motion.div>

        <motion.div
          className='dota-card flex flex-col rounded-2xl p-6'
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}>
          <div className='flex items-center gap-3 text-sm text-zinc-500'>
            <Globe className='w-6 h-6 stroke-zinc-500' />
            多语言互译
          </div>
          <div className='mt-4 text-sm text-zinc-400'>
            支持中文、英文、俄文等主流语言的双向翻译，满足国际服沟通需求。
          </div>
        </motion.div>
      </div>
    </div>
  );
}
