import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { useStore } from '../components/StoreProvider';
import { Kbd, PageHead } from '../components/lg';
import { IPlay, IShield } from '../icons';
import { hotkeyLabelsFromSettings } from '../constants/hotkeys';
import { TUTORIAL_PANORAMA } from '../constants/backdrops';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Tutorial() {
  const { t } = useI18n();
  const { settings } = useStore();
  const hotkeyKeys = useMemo(() => hotkeyLabelsFromSettings(settings), [settings]);

  const [activeStep, setActiveStep] = useState(0);
  const [doneSteps, setDoneSteps] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [typed, setTyped] = useState('');
  const [boxState, setBoxState] = useState('');
  const [keysVisible, setKeysVisible] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');
  const [pressed, setPressed] = useState([]);
  const runRef = useRef(0);

  const steps = [
    { title: t('tutorial.step1Title'), desc: t('tutorial.step1Desc') },
    { title: t('tutorial.step2Title'), desc: t('tutorial.step2Desc') },
    { title: t('tutorial.step3Title'), desc: t('tutorial.step3Desc') },
  ];

  const play = useCallback(async () => {
    if (playing) return;
    const token = runRef.current + 1;
    runRef.current = token;
    const alive = () => runRef.current === token;
    const reduce = prefersReducedMotion();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduce ? 0 : ms));
    const typeText = async (text, ms) => {
      setTyped('');
      for (let i = 1; i <= text.length; i += 1) {
        if (!alive()) return;
        setTyped(text.slice(0, i));
        await wait(ms);
      }
    };

    setPlaying(true);
    setDoneSteps(0);
    setBoxState('');
    setKeysVisible(false);
    setPressed([]);

    try {
      setActiveStep(0);
      await wait(400);
      await typeText(t('tutorial.step1MockText'), 80);
      if (!alive()) return;
      await wait(700);

      setActiveStep(1);
      setDoneSteps(1);
      setKeyMessage(t('tutorial.pressingKeys'));
      setKeysVisible(true);
      await wait(400);
      setPressed([0]);
      await wait(120);
      setPressed([0, hotkeyKeys.length - 1]);
      await wait(260);
      setPressed([]);
      setKeyMessage(t('tutorial.step2InProgress'));
      setBoxState('rec shimmer');
      await wait(1400);
      if (!alive()) return;

      setActiveStep(2);
      setDoneSteps(2);
      setBoxState('rec flash');
      setKeyMessage(t('tutorial.doneSend'));
      await typeText(t('tutorial.step3MockText'), 20);
      if (!alive()) return;
      await wait(600);
      setBoxState('');
      await wait(1400);
      setKeysVisible(false);
      setDoneSteps(3);
      setActiveStep(-1);
    } finally {
      if (alive()) setPlaying(false);
    }
  }, [playing, t, hotkeyKeys]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void play();
    }, 500);
    return () => {
      clearTimeout(timer);
      runRef.current += 1;
    };
    // Autoplay once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boxClass = ['tutorial__box', ...boxState.split(' ').filter(Boolean).map((s) => `tutorial__box--${s}`)].join(' ');

  return (
    <>
      <PageHead
        title={t('tutorial.pageTitle')}
        sub={t('tutorial.pageSub')}
        right={
          <button type='button' className='lg-btn lg-btn--primary' onClick={play} disabled={playing}>
            <IPlay aria-hidden='true' />
            {t('tutorial.play')}
          </button>
        }
      />
      <div className='tutorial'>
        <div className='tutorial__steps lg-rise' style={{ '--i': 1 }}>
          {steps.map((step, index) => (
            <div
              key={step.title}
              className={`tutorial__step${activeStep === index ? ' tutorial__step--on' : ''}${
                doneSteps > index && activeStep !== index ? ' tutorial__step--done' : ''
              }`}>
              <span className='tutorial__num'>{index + 1}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
          <div className='tutorial__safety'>
            <span className='lg-card__icon'>
              <IShield />
            </span>
            <div>
              <b>{t('tutorial.safetyTitle')}</b>
              <span>{t('tutorial.safetyDesc')}</span>
            </div>
          </div>
        </div>

        <div
          className='tutorial__stage lg-rise'
          style={{ '--i': 2, backgroundImage: `url(${TUTORIAL_PANORAMA})` }}
          aria-hidden='true'>
          <div className='tutorial__hud'>
            <span>Radiant 23 : 19 Dire</span>
            <span>
              34:12 · <b>Roshan alive</b>
            </span>
          </div>
          <div className='tutorial__log'>
            <div>
              <span className='ally'>[ALLIES] Kuro:</span> push top after this
            </div>
            <div>
              <span className='enemy'>[ALL] Dendi:</span> gg ez mid
            </div>
            <div>
              <span className='ally'>[ALLIES] Miracle:</span> ward river pls
            </div>
          </div>
          <div className={boxClass}>
            <span className='ch'>{t('tutorial.step1MockChannel')}</span>
            <span className='stage__text'>{typed}</span>
            <span className='stage__caret' />
          </div>
          <div className={`tutorial__keys${keysVisible ? ' tutorial__keys--on' : ''}`}>
            <Kbd keys={hotkeyKeys} size='sm' pressed={pressed} />
            <span>{keyMessage}</span>
          </div>
        </div>
      </div>
    </>
  );
}
