import { motion } from 'framer-motion';
import HotkeyCard from './components/HotkeyCard';
import TranslationDirectionCard from './components/TranslationDirectionCard';
import EnableStatusCard from './components/EnableStatusCard';
import { CircleInfo, KeyboardAlt, Sparkles } from '../../icons';
import { useI18n } from '../../i18n/I18nProvider';

export default function Home() {
  const { t } = useI18n();

  const steps = [
    {
      id: '01',
      title: t('home.guide.step1Title'),
      desc: t('home.guide.step1Desc'),
    },
    {
      id: '02',
      title: t('home.guide.step2Title'),
      desc: t('home.guide.step2Desc'),
    },
    {
      id: '03',
      title: t('home.guide.step3Title'),
      desc: t('home.guide.step3Desc'),
    },
  ];

  return (
    <div className='grid min-h-full grid-cols-12 gap-x-6 gap-y-12'>
      <div className='col-span-4 flex min-h-[252px] min-w-0'>
        <TranslationDirectionCard />
      </div>

      <div className='col-span-4 flex min-h-[252px] min-w-0'>
        <HotkeyCard />
      </div>

      <div className='col-span-4 flex min-h-[252px] min-w-0'>
        <EnableStatusCard />
      </div>

      <motion.section
        className='dota-card tool-rise col-span-7 min-w-0 p-6'
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <CircleInfo className='tool-section-head__icon' />
              <h2 className='tool-card-title'>{t('home.guide.title')}</h2>
            </div>
          </div>
        </div>
        <p className='tool-body tool-section-summary'>{t('home.guide.summary')}</p>

        <div className='mt-6 grid grid-cols-3 gap-4'>
          {steps.map((step) => (
            <article key={step.id} className='tool-subcard tool-rise p-5'>
              <div className='tool-caption tracking-[0.16em]'>{step.id}</div>
              <h3 className='tool-card-title mt-2'>{step.title}</h3>
              <p className='tool-body mt-2'>{step.desc}</p>
            </article>
          ))}
        </div>
      </motion.section>

      <motion.section
        className='dota-card tool-rise col-span-5 min-w-0 p-6'
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <CircleInfo className='tool-section-head__icon' />
              <h2 className='tool-card-title'>{t('home.demo.title')}</h2>
            </div>
          </div>
          <div className='tool-pill'>{t('home.demo.badge')}</div>
        </div>
        <p className='tool-body tool-section-summary'>{t('home.demo.summary')}</p>

        <div className='mt-5 space-y-4'>
          <div className='tool-subcard p-4'>
            <div className='flex items-center gap-2 text-zinc-800'>
              <KeyboardAlt className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('home.demo.sourceLabel')}</span>
            </div>
            <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>{t('home.demo.sourceText')}</div>
          </div>

          <div className='flex items-center gap-3 px-1'>
            <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
            <div className='tool-pill'>{t('home.demo.resultBadge')}</div>
            <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
          </div>

          <div className='tool-subcard p-4'>
            <div className='flex items-center gap-2 text-zinc-800'>
              <Sparkles className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('home.demo.resultLabel')}</span>
            </div>
            <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>{t('home.demo.resultText')}</div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
