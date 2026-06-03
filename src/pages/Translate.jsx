import { useEffect, useState } from 'react';
import { useStore } from '../components/StoreProvider';
import { useI18n } from '../i18n/I18nProvider';
import { Chip, PageHead } from '../components/lg';
import { ICheck } from '../icons';
import { showError } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

const STYLE_IDS = ['auto', 'pro', 'toxic'];

const STYLE_COLORS = {
  auto: '#4d70f5',
  pro: '#16a36b',
  toxic: '#c93434',
};

export default function Translate() {
  const { settings, updateSettings } = useStore();
  const { t } = useI18n();
  const [active, setActive] = useState(settings?.translation_mode || 'auto');

  useEffect(() => {
    if (settings?.translation_mode) {
      setActive(settings.translation_mode);
    }
  }, [settings?.translation_mode]);

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STYLE_IDS.map((id) => {
          const isActive = id === active;
          const color = STYLE_COLORS[id];
          return (
            <button
              key={id}
              type='button'
              onClick={() => handleSelect(id)}
              className='lg-card'
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                padding: 0,
                overflow: 'hidden',
                border: isActive ? `1.5px solid ${color}` : '1px solid var(--lg-line-1)',
                boxShadow: isActive
                  ? `0 12px 28px -10px ${color}40, 0 0 0 4px ${color}14`
                  : 'var(--lg-sh-card)',
              }}>
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                {/* Left meta */}
                <div
                  style={{
                    flex: '0 0 240px',
                    padding: '16px 18px',
                    borderRight: '1px solid var(--lg-line-3)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: `${color}1a`,
                        color,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        fontSize: 11,
                        letterSpacing: '.04em',
                        border: `1px solid ${color}33`,
                      }}>
                      {id.toUpperCase().slice(0, 3)}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--lg-ink-0)' }}>
                        {t(`translate.mode.${id}.title`)}
                      </div>
                      <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>
                        {t(`translate.mode.${id}.tag`)}
                      </div>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: 'var(--lg-ink-2)',
                      lineHeight: 1.5,
                      marginTop: 10,
                      marginBottom: 0,
                    }}>
                    {t(`translate.mode.${id}.desc`)}
                  </p>
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 11,
                      color: 'var(--lg-ink-3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--lg-ink-4)',
                      }}
                    />
                    {t(`translate.mode.${id}.note`)}
                  </div>
                </div>

                {/* Middle example */}
                <div style={{ flex: 1, padding: '16px 18px', background: 'var(--lg-surf-2)' }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--lg-ink-3)',
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                    }}>
                    {t('translate.sectionInput')}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--lg-ink-2)',
                      marginTop: 4,
                      padding: '6px 10px',
                      background: '#fff',
                      borderRadius: 8,
                      border: '1px solid var(--lg-line-1)',
                      display: 'inline-block',
                      fontStyle: 'italic',
                    }}>
                    {t(`translate.mode.${id}.src`)}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--lg-ink-3)',
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      marginTop: 12,
                    }}>
                    {t('translate.sectionOutput')}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--lg-ink-0)',
                      marginTop: 4,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: `${color}10`,
                      border: `1px solid ${color}33`,
                      display: 'inline-block',
                      fontFamily: 'var(--lg-mono)',
                    }}>
                    {t(`translate.mode.${id}.out`)}
                  </div>
                </div>

                {/* Right state */}
                <div
                  style={{
                    flex: '0 0 110px',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 16,
                  }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      border: isActive ? `2px solid ${color}` : '2px solid var(--lg-line-2)',
                      background: isActive ? color : '#fff',
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      transition: 'all var(--lg-dur) var(--lg-ease)',
                    }}>
                    {isActive ? <ICheck style={{ width: 16, height: 16 }} /> : null}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
