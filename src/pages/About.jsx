import { useEffect, useMemo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useI18n } from '../i18n/I18nProvider';
import { useUpdater } from '../components/UpdateProvider';
import { Chip, PageHead } from '../components/lg';
import {
  ICheck,
  IChat,
  IDownload,
  IInfo,
  IRefresh,
} from '../icons';
import { APP_VERSION_LABEL, RELEASE_PAGE_URL } from '../constants/version';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { DEFAULT_PUBLIC_SITE_CONFIG, loadPublicSiteConfig } from '../services/publicSiteConfig';
import { showError, showInfo, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

const stripLeadingMarkdownHeading = (value) => {
  if (typeof value !== 'string') return '';
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  let firstContentIndex = 0;
  while (firstContentIndex < lines.length && !lines[firstContentIndex].trim()) {
    firstContentIndex += 1;
  }
  if (firstContentIndex < lines.length && /^\s{0,3}#{1,6}\s+.+$/.test(lines[firstContentIndex])) {
    lines.splice(firstContentIndex, 1);
    if (firstContentIndex < lines.length && !lines[firstContentIndex].trim()) {
      lines.splice(firstContentIndex, 1);
    }
  }
  return lines.join('\n').trim();
};

const normalizeReleaseNotes = (value) =>
  stripLeadingMarkdownHeading(value).replace(/\n{3,}/g, '\n\n').trim();

const openContactLink = async (url, t) => {
  try {
    if (hasTauriRuntime()) {
      await openUrl(url);
      return;
    }
    if (typeof window !== 'undefined') {
      if (url.startsWith('mailto:')) {
        window.location.href = url;
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    showError(t('developerNote.openLinkFailed', { error: toErrorMessage(error) }));
  }
};

const copyTextFallback = (value) => {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = Boolean(document.execCommand?.('copy'));
  } finally {
    textarea.remove();
  }
  return copied;
};

const copyContactValue = async (value, t) => {
  try {
    if (hasTauriRuntime()) {
      try {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(value);
        showSuccess(t('about.project.contactQqCopied'));
        return;
      } catch {
        // Fall through.
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        showSuccess(t('about.project.contactQqCopied'));
        return;
      } catch {
        // Some preview contexts deny clipboard permission even when the API exists.
      }
    }
    if (copyTextFallback(value)) {
      showSuccess(t('about.project.contactQqCopied'));
      return;
    }
    showInfo(t('about.project.contactCopyManual', { value }));
  } catch (error) {
    showError(t('about.project.contactCopyFailed', { error: toErrorMessage(error) }));
  }
};

export default function About() {
  const { locale, t } = useI18n();
  const [publicSiteConfig, setPublicSiteConfig] = useState(DEFAULT_PUBLIC_SITE_CONFIG);
  const {
    currentVersion,
    latestVersion,
    hasUpdate,
    manualUpdateRequired,
    checking,
    downloading,
    progressPercent,
    checkedAt,
    releaseDate,
    releaseBody,
    errorMessage,
    checkForUpdates,
    installUpdate,
    supportsUpdater,
  } = useUpdater();

  useEffect(() => {
    let disposed = false;
    void loadPublicSiteConfig().then((config) => {
      if (!disposed) setPublicSiteConfig(config);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp) return t('common.notChecked');
    try {
      return new Date(timestamp).toLocaleString(locale);
    } catch {
      return t('common.notChecked');
    }
  };

  const formatReleaseDate = (value) => {
    if (!value) return t('common.unknown');
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return t('common.unknown');
      return parsed.toLocaleDateString(locale);
    } catch {
      return t('common.unknown');
    }
  };

  const versionLabel = currentVersion ? `V${currentVersion}` : APP_VERSION_LABEL;
  const latestVersionLabel = latestVersion ? `V${latestVersion}` : t('about.update.latestUnavailable');
  const actionLabel = !supportsUpdater
    ? t('about.update.actionUnsupported')
    : checking
      ? t('about.update.actionChecking')
      : downloading
        ? t('about.update.actionDownloading')
        : hasUpdate
          ? manualUpdateRequired
            ? t('about.update.actionOpenRelease')
            : t('about.update.actionInstall')
          : t('about.update.actionCheck');
  const actionHandler = manualUpdateRequired
    ? () => {
        void openContactLink(RELEASE_PAGE_URL, t);
      }
    : hasUpdate
      ? installUpdate
      : () => checkForUpdates({ silent: false });
  const actionDisabled = !supportsUpdater || checking || downloading;
  const releaseNotesBody = normalizeReleaseNotes(releaseBody);

  const heroTitle = hasUpdate
    ? t('about.heroTitleAvailable', { version: latestVersionLabel })
    : t('about.heroTitleLatest');
  const heroSub = hasUpdate ? t('about.heroSubAvailable') : t('about.heroSubLatest');

  const contactItems = useMemo(() => {
    const contact = publicSiteConfig?.contact || DEFAULT_PUBLIC_SITE_CONFIG.contact;
    return [
      {
        key: 'discord',
        label: t('about.project.contactDiscord'),
        value: contact.discordUrl.replace(/^https?:\/\//, ''),
        actionLabel: t('about.project.contactActionOpen'),
        action: () => openContactLink(contact.discordUrl, t),
      },
      {
        key: 'qq-group',
        label: t('about.project.contactQqGroup'),
        value: contact.qqGroup,
        actionLabel: t('about.project.contactActionCopy'),
        action: () => copyContactValue(contact.qqGroup, t),
      },
      {
        key: 'email',
        label: t('about.project.contactEmail'),
        value: contact.email,
        actionLabel: t('about.project.contactActionOpen'),
        action: () => openContactLink(`mailto:${contact.email}`, t),
      },
    ];
  }, [publicSiteConfig, t]);

  return (
    <>
      <PageHead title={t('about.pageTitle')} sub={t('about.pageSub')} />

      {/* Update hero */}
      <div className='lg-card' style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '18px 22px',
            background: hasUpdate
              ? 'linear-gradient(135deg, rgba(245,158,11,.10), rgba(245,158,11,.04))'
              : 'linear-gradient(135deg, rgba(22,163,107,.08), rgba(22,163,107,.02))',
            borderBottom: '1px solid var(--lg-line-3)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: hasUpdate
                  ? 'linear-gradient(135deg, #f59e0b, #ea7917)'
                  : 'linear-gradient(135deg, #16a36b, #0c8a55)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                boxShadow: hasUpdate
                  ? '0 8px 18px -6px rgba(245,158,11,.5)'
                  : '0 8px 18px -6px rgba(22,163,107,.5)',
              }}>
              {hasUpdate ? (
                <IDownload style={{ width: 20, height: 20 }} />
              ) : (
                <ICheck style={{ width: 20, height: 20 }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--lg-ink-0)' }}>
                  {heroTitle}
                </div>
                {hasUpdate ? (
                  <Chip tone='warn-strong' lg dot>
                    {t('about.chipUpdateAvailable')}
                  </Chip>
                ) : (
                  <Chip tone='success' lg dot>
                    {t('about.chipLatest')}
                  </Chip>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--lg-ink-2)', marginTop: 4 }}>
                {heroSub}
              </div>
            </div>
            {supportsUpdater ? (
              <button
                type='button'
                className={`lg-btn ${hasUpdate ? 'lg-btn--warn' : ''}`}
                onClick={actionHandler}
                disabled={actionDisabled}
                style={actionDisabled ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}>
                {hasUpdate ? <IDownload /> : <IRefresh />}
                {actionLabel}
              </button>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--lg-ink-3)' }}>
                {t('about.update.actionUnsupported')}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {[
            { l: t('about.update.currentVersion'), v: versionLabel },
            {
              l: t('about.update.latestVersion'),
              v: latestVersionLabel,
              highlight: hasUpdate,
            },
            { l: t('about.update.releaseDate'), v: formatReleaseDate(releaseDate) },
            { l: t('about.update.checkedAt'), v: formatTime(checkedAt) },
          ].map((it, i) => (
            <div
              key={it.l}
              style={{
                padding: '14px 18px',
                borderRight: i < 3 ? '1px solid var(--lg-line-3)' : 'none',
              }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'var(--lg-ink-3)',
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                }}>
                {it.l}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: it.highlight ? '#c4651a' : 'var(--lg-ink-0)',
                  marginTop: 4,
                  fontFamily: 'var(--lg-mono)',
                  wordBreak: 'break-word',
                }}>
                {it.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {downloading ? (
        <div className='lg-card' style={{ marginTop: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--lg-info-ink)',
            }}>
            <span>{t('about.update.downloadProgress')}</span>
            <span>{progressPercent}%</span>
          </div>
          <div
            style={{
              marginTop: 8,
              height: 6,
              borderRadius: 3,
              background: 'var(--lg-info-bg)',
              overflow: 'hidden',
            }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: 'var(--lg-brand-grad)',
                transition: 'width var(--lg-dur) var(--lg-ease)',
              }}
            />
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className='lg-card'
          style={{ marginTop: 14, borderColor: 'rgba(210,58,58,.32)', background: 'var(--lg-danger-bg)' }}>
          <div style={{ fontSize: 13, color: 'var(--lg-danger-ink)' }}>{errorMessage}</div>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 14,
          marginTop: 14,
        }}>
        {/* Release notes */}
        <div className='lg-card'>
          <div className='lg-card__head'>
            <div className='lg-card__icon'>
              <IInfo />
            </div>
            <div className='lg-card__title'>{t('about.releaseNotesTitle')}</div>
          </div>
          {releaseNotesBody ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--lg-ink-2)',
                lineHeight: 1.7,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
                marginTop: 4,
              }}>
              {releaseNotesBody}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--lg-ink-3)' }}>
              {t('about.project.featureBody')}
            </div>
          )}
        </div>

        {/* Contact */}
        <div className='lg-card'>
          <div className='lg-card__head'>
            <div className='lg-card__icon'>
              <IChat />
            </div>
            <div className='lg-card__title'>{t('about.contactCardTitle')}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contactItems.map((c) => (
              <button
                key={c.key}
                type='button'
                onClick={() => {
                  void c.action();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: 'var(--lg-surf-2)',
                  border: '1px solid var(--lg-line-1)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all var(--lg-dur) var(--lg-ease)',
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--lg-ink-3)',
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                    }}>
                    {c.label}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: 'var(--lg-ink-0)',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                    {c.value}
                  </div>
                </div>
                <Chip>{c.actionLabel}</Chip>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
