import { useI18n } from '../i18n/I18nProvider';
import { Chip, Kbd, PageHead } from '../components/lg';
import { IArrowR, IShield } from '../icons';
import { defaultTranslatorHotkeyLabel } from '../constants/hotkeys';

function Mock({ children, accent }) {
  return (
    <div
      style={{
        background: '#0b1430',
        color: '#dfe6f5',
        padding: '8px 10px',
        borderRadius: 8,
        fontFamily: 'var(--lg-mono)',
        fontSize: 12,
        border: `1px solid ${accent || 'rgba(97,235,255,.22)'}`,
      }}>
      {children}
    </div>
  );
}

export default function Tutorial() {
  const { t } = useI18n();

  const hotkeyLabel = defaultTranslatorHotkeyLabel();
  const hotkeyKeys = hotkeyLabel.split('+');

  const steps = [
    {
      n: '01',
      title: t('tutorial.step1Title'),
      desc: t('tutorial.step1Desc'),
      mock: (
        <Mock>
          <span style={{ color: '#61ebff' }}>{t('tutorial.step1MockChannel')} </span>
          {t('tutorial.step1MockText')}
          <span
            style={{
              borderLeft: '2px solid #61ebff',
              marginLeft: 1,
              animation: 'lg-pulse-ring 1s steps(2) infinite',
            }}>
            &nbsp;
          </span>
        </Mock>
      ),
    },
    {
      n: '02',
      title: t('tutorial.step2Title'),
      desc: t('tutorial.step2Desc'),
      mock: (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 10px',
            background: 'var(--lg-surf-2)',
            borderRadius: 8,
          }}>
          <Kbd keys={hotkeyKeys} />
          <IArrowR style={{ color: 'var(--lg-ink-4)', width: 14, height: 14 }} />
          <span style={{ fontSize: 11.5, color: 'var(--lg-ink-2)' }}>{t('tutorial.step2InProgress')}</span>
          <div
            style={{
              marginLeft: 'auto',
              width: 28,
              height: 4,
              borderRadius: 2,
              background: 'var(--lg-surf-3)',
              overflow: 'hidden',
            }}>
            <div style={{ width: '60%', height: '100%', background: 'var(--lg-brand-grad)' }} />
          </div>
        </div>
      ),
    },
    {
      n: '03',
      title: t('tutorial.step3Title'),
      desc: t('tutorial.step3Desc'),
      mock: (
        <Mock accent='rgba(22,163,107,.35)'>
          <span style={{ color: '#61ebff' }}>{t('tutorial.step3MockChannel')} </span>
          {t('tutorial.step3MockText')}
          <span style={{ color: 'rgba(255,255,255,.4)' }}> ⏎</span>
        </Mock>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title={t('tutorial.pageTitle')}
        sub={t('tutorial.pageSub')}
        right={<Chip tone='info'>{t('tutorial.pageRightChip')}</Chip>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {steps.map((s, i) => (
          <div key={s.n} className='lg-card' style={{ padding: 18, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                fontSize: 28,
                fontWeight: 800,
                color: 'var(--lg-line-2)',
                fontFamily: 'var(--lg-mono)',
                letterSpacing: '-0.03em',
              }}>
              {s.n}
            </div>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--lg-brand-grad)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 12,
              }}>
              {i + 1}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--lg-ink-0)',
                marginTop: 12,
              }}>
              {s.title}
            </div>
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--lg-ink-2)',
                lineHeight: 1.55,
                marginTop: 6,
                marginBottom: 14,
              }}>
              {s.desc}
            </p>
            {s.mock}
            {i < steps.length - 1 ? (
              <div
                style={{
                  position: 'absolute',
                  right: -14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#fff',
                  border: '1px solid var(--lg-line-1)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--lg-ink-3)',
                  boxShadow: 'var(--lg-sh-card)',
                  zIndex: 2,
                }}>
                <IArrowR style={{ width: 14, height: 14 }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        className='lg-card lg-card--inset'
        style={{ marginTop: 18, display: 'flex', gap: 16, alignItems: 'center' }}>
        <div className='lg-card__icon' style={{ flex: '0 0 32px' }}>
          <IShield />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--lg-ink-0)' }}>
            {t('tutorial.safetyTitle')}
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--lg-ink-2)',
              lineHeight: 1.55,
              marginTop: 4,
            }}>
            {t('tutorial.safetyDesc')}
          </div>
        </div>
      </div>
    </>
  );
}
