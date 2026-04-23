import { motion } from 'framer-motion';
import { BookOpen, CircleInfo, KeyboardAlt, Sparkles } from '../icons';
import { useI18n } from '../i18n/I18nProvider';
import PageHeader from '../components/PageHeader';
import PanelCard from '../components/PanelCard';
import StatusChip from '../components/StatusChip';

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
    <div className='tutorial-page flex min-h-full flex-col gap-6'>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <PageHeader
          icon={<BookOpen className='h-5 w-5 stroke-current' />}
          title={t('tutorial.title')}
          description={t('tutorial.summary')}
        />
      </motion.div>

      <div className='tutorial-layout-grid'>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}>
          <PanelCard
            className='tutorial-layout-grid__guide home-panel tool-rise'
            icon={<CircleInfo className='tool-section-head__icon' />}
            title={t('tutorial.guide.title')}
            description={t('tutorial.guide.summary')}>

            <div className='tutorial-step-grid'>
              {steps.map((step) => (
                <article key={step.id} className='tutorial-step tool-subcard tool-rise'>
                  <div className='tutorial-step__number'>{step.id}</div>
                  <h3 className='tool-card-title mt-2'>{step.title}</h3>
                  <p className='tool-body'>{step.desc}</p>
                </article>
              ))}
            </div>
          </PanelCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}>
          <PanelCard
            className='tutorial-layout-grid__demo home-panel tool-rise'
            icon={<CircleInfo className='tool-section-head__icon' />}
            title={t('tutorial.demo.title')}
            description={t('tutorial.demo.summary')}
            actions={<StatusChip label={t('tutorial.demo.badge')} tone='info' />}>

            <div className='tutorial-demo-stack'>
              <div className='tool-subcard tutorial-demo-block p-4'>
                <div className='flex items-center gap-2 text-zinc-800'>
                  <KeyboardAlt className='h-4 w-4 stroke-zinc-500' />
                  <span className='tool-caption'>{t('tutorial.demo.sourceLabel')}</span>
                </div>
                <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>{t('tutorial.demo.sourceText')}</div>
              </div>

              <div className='tutorial-demo-connector flex items-center gap-3 px-1'>
                <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
                <StatusChip label={t('tutorial.demo.resultBadge')} tone='success' />
                <div className='h-px flex-1 bg-[rgba(214,224,236,0.86)]' />
              </div>

              <div className='tool-subcard tutorial-demo-block tutorial-demo-block--accent p-4'>
                <div className='flex items-center gap-2 text-zinc-800'>
                  <Sparkles className='h-4 w-4 stroke-zinc-500' />
                  <span className='tool-caption'>{t('tutorial.demo.resultLabel')}</span>
                </div>
                <div className='mt-3 text-[17px] font-semibold leading-7 text-zinc-900'>{t('tutorial.demo.resultText')}</div>
              </div>
            </div>
          </PanelCard>
        </motion.div>
      </div>
    </div>
  );
}
