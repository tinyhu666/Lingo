import { motion } from 'framer-motion';
import { BookOpen, CircleInfo, KeyboardAlt, Sparkles } from '../icons';
import { useI18n } from '../i18n/I18nProvider';

export default function Tutorial() {
  const { t } = useI18n();

  const steps = [
    {
      id: '01',
      title: t('tutorial.guide.step1Title'),
      desc: t('tutorial.guide.step1Desc'),
    },
    {
      id: '02',
      title: t('tutorial.guide.step2Title'),
      desc: t('tutorial.guide.step2Desc'),
    },
    {
      id: '03',
      title: t('tutorial.guide.step3Title'),
      desc: t('tutorial.guide.step3Desc'),
    },
  ];

  return (
    <div className='tutorial-page'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className='desktop-tight-header desktop-tight-header--start flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0'>
            <div className='flex items-center gap-3'>
              <span className='workspace-header__icon h-11 w-11 min-w-[44px]'>
                <BookOpen className='h-5 w-5 stroke-current' />
              </span>
              <h2 className='tool-page-title mt-0'>{t('tutorial.title')}</h2>
            </div>
            <p className='tool-body mt-4'>{t('tutorial.summary')}</p>
          </div>
        </div>
      </motion.section>

      <div className='tutorial-layout-grid'>
        <motion.section
          className='tutorial-layout-grid__guide home-panel dota-card tool-rise'
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}>
          <div className='tool-section-head'>
            <div className='tool-section-head__main'>
              <div className='tool-section-head__title-row'>
                <CircleInfo className='tool-section-head__icon' />
                <h2 className='tool-card-title'>{t('tutorial.guide.title')}</h2>
              </div>
            </div>
          </div>
          <p className='tool-body tool-section-summary'>{t('tutorial.guide.summary')}</p>

          <div className='tutorial-step-grid'>
            {steps.map((step) => (
              <article key={step.id} className='tutorial-step tool-subcard tool-rise'>
                <div className='tool-caption tracking-[0.16em]'>{step.id}</div>
                <h3 className='tool-card-title mt-2'>{step.title}</h3>
                <p className='tool-body'>{step.desc}</p>
              </article>
            ))}
          </div>
        </motion.section>

        <motion.section
          className='tutorial-layout-grid__demo home-panel dota-card tool-rise'
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}>
          <div className='tool-section-head'>
            <div className='tool-section-head__main'>
              <div className='tool-section-head__title-row'>
                <CircleInfo className='tool-section-head__icon' />
                <h2 className='tool-card-title'>{t('tutorial.demo.title')}</h2>
              </div>
            </div>
            <div className='tool-pill'>{t('tutorial.demo.badge')}</div>
          </div>
          <p className='tool-body tool-section-summary'>{t('tutorial.demo.summary')}</p>

          <div className='tutorial-demo-stack'>
            <div className='tool-subcard p-4'>
              <div className='flex items-center gap-2 text-zinc-800'>
                <KeyboardAlt className='h-4 w-4 stroke-zinc-500' />
                <span className='tool-caption'>{t('tutorial.demo.sourceLabel')}</span>
              </div>
              <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>{t('tutorial.demo.sourceText')}</div>
            </div>

            <div className='flex items-center gap-3 px-1'>
              <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
              <div className='tool-pill'>{t('tutorial.demo.resultBadge')}</div>
              <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
            </div>

            <div className='tool-subcard p-4'>
              <div className='flex items-center gap-2 text-zinc-800'>
                <Sparkles className='h-4 w-4 stroke-zinc-500' />
                <span className='tool-caption'>{t('tutorial.demo.resultLabel')}</span>
              </div>
              <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>{t('tutorial.demo.resultText')}</div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
