import { useEffect, useRef, useState } from 'react';
import { useStore } from '../components/StoreProvider';
import { useI18n } from '../i18n/I18nProvider';
import { Chip, PageHead } from '../components/lg';
import { IArrowR, ICheck } from '../icons';
import { showError } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

const STYLE_IDS = ['auto', 'pro', 'toxic'];
const STYLE_ABBR = { auto: 'NOR', pro: 'PRO', toxic: 'TOX' };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Translate() {
  const { settings, updateSettings } = useStore();
  const { t } = useI18n();
  const [active, setActive] = useState(settings?.translation_mode || 'auto');
  const [typed, setTyped] = useState('');
  const typingRef = useRef(0);

  useEffect(() => {
    if (settings?.translation_mode) {
      setActive(settings.translation_mode);
    }
  }, [settings?.translation_mode]);

  // Re-type the preview output whenever the active style changes.
  useEffect(() => {
    const target = t(`translate.mode.${active}.preview`);
    const token = typingRef.current + 1;
    typingRef.current = token;
    if (prefersReducedMotion()) {
      setTyped(target);
      return undefined;
    }
    setTyped('');
    let index = 0;
    let timer = null;
    const step = () => {
      if (typingRef.current !== token) return;
      index += 1;
      setTyped(target.slice(0, index));
      if (index < target.length) {
        timer = setTimeout(step, 22);
      }
    };
    timer = setTimeout(step, 250);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [active, t]);

  const handleSelect = async (id) => {
    if (id === active) return;
    const prev = active;
    setActive(id);
    try {
      await updateSettings({ translation_mode: id });
    } catch (error) {
      setActive(prev);
      showError(t('translate.switchFailed', { error: toErrorMessage(error) }));
    }
  };

  return (
    <>
      <PageHead
        title={t('translate.pageTitle')}
        sub={t('translate.pageSub')}
        right={<Chip tone='info' dot>{t('translate.pageRightChip')}</Chip>}
      />
      <div className='tones'>
        {STYLE_IDS.map((id, index) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type='button'
              onClick={() => handleSelect(id)}
              className={`tone lg-rise${isActive ? ' tone--on' : ''}`}
              style={{ '--i': index + 1 }}
              aria-pressed={isActive}>
              <span className='tone__check' aria-hidden='true'>
                <ICheck />
              </span>
              <div className='tone__head'>
                <span className={`tone__icon tone__icon--${id}`}>{STYLE_ABBR[id]}</span>
                <div>
                  <h3>{t(`translate.mode.${id}.title`)}</h3>
                  <div className={`tone__tag${id === 'toxic' ? ' tone__tag--warn' : ''}`}>
                    {t(`translate.mode.${id}.tag`)}
                  </div>
                </div>
              </div>
              <p>{t(`translate.mode.${id}.desc`)}</p>
              <div className='tone__sample'>
                <div className='in'>
                  <span className='lab'>In</span>
                  {t(`translate.mode.${id}.src`)}
                </div>
                <div className='out'>
                  <span className='lab'>Out</span>
                  {t(`translate.mode.${id}.out`)}
                </div>
              </div>
              <div className='tone__note'>· {t(`translate.mode.${id}.note`)}</div>
            </button>
          );
        })}
      </div>

      <div className='tone-preview lg-rise' style={{ '--i': 4 }}>
        <div>
          <span className='tone-preview__lab'>{t('translate.sectionInput')}</span>
          <div className='tone-preview__box'>
            <span className='ch'>[ALL]</span>
            <span>{t('translate.previewSource')}</span>
          </div>
        </div>
        <div className='tone-preview__arrow' aria-hidden='true'>
          <IArrowR />
        </div>
        <div>
          <span className='tone-preview__lab'>
            {t('translate.sectionOutput')} · {t(`translate.mode.${active}.title`)}
          </span>
          <div className='tone-preview__box' aria-live='polite'>
            <span className='ch'>[ALL]</span>
            <span>{typed}</span>
            <span className='tone-preview__caret' aria-hidden='true' />
          </div>
        </div>
      </div>
    </>
  );
}
