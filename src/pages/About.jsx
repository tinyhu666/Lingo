import { useEffect, useMemo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useI18n } from '../i18n/I18nProvider';
import { useUpdater } from '../components/UpdateProvider';
import { Chip, PageHead } from '../components/lg';
import { IChat, IDiscord, IDownload, IExternal, IMail, IRefresh } from '../icons';
import { APP_VERSION_LABEL, RELEASE_PAGE_URL } from '../constants/version';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { DEFAULT_PUBLIC_SITE_CONFIG, loadPublicSiteConfig } from '../services/publicSiteConfig';
import { showError, showInfo, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';
import appIcon from '../assets/app-icon.png';

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
      return new Date(timestamp).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
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

  const versionLabel = currentVersion ? `v${currentVersion}` : APP_VERSION_LABEL.replace(/^V/, 'v');
  const latestVersionLabel = latestVersion ? `v${latestVersion}` : t('about.update.latestUnavailable');
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

  const contactItems = useMemo(() => {
    const contact = publicSiteConfig?.contact || DEFAULT_PUBLIC_SITE_CONFIG.contact;
    return [
      {
        key: 'discord',
        icon: <IDiscord />,
        label: t('about.project.contactDiscord'),
        value: contact.discordUrl.replace(/^https?:\/\//, ''),
        actionLabel: t('about.project.contactActionOpen'),
        action: () => openContactLink(contact.discordUrl, t),
      },
      {
        key: 'qq-group',
        icon: <IChat />,
        label: t('about.project.contactQqGroup'),
        value: contact.qqGroup,
        actionLabel: t('about.project.contactActionCopy'),
        action: () => copyContactValue(contact.qqGroup, t),
      },
      {
        key: 'email',
        icon: <IMail />,
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

      <div className='about'>
        <div className='lg-card lg-card--glass about__version lg-rise' style={{ '--i': 1 }}>
          <div className='about__hero'>
            <img className='about__logo' src={appIcon} alt='' />
            <div style={{ minWidth: 0 }}>
              <h2>
                Lingo
                {hasUpdate ? (
                  <Chip tone='warn' dot>
                    {t('about.chipUpdateAvailable')}
                  </Chip>
                ) : (
                  <Chip tone='success' dot>
                    {t('about.chipLatest')}
                  </Chip>
                )}
              </h2>
            </div>
          </div>

          <div className='about__meta'>
            <div>
              <div className='k'>{t('about.update.currentVersion')}</div>
              <div className='v'>{versionLabel}</div>
            </div>
            <div>
              <div className='k'>{t('about.update.latestVersion')}</div>
              <div className={`v${hasUpdate ? ' v--highlight' : ''}`}>{latestVersionLabel}</div>
            </div>
            <div>
              <div className='k'>{t('about.update.releaseDate')}</div>
              <div className='v'>{formatReleaseDate(releaseDate)}</div>
            </div>
            <div>
              <div className='k'>{t('about.update.checkedAt')}</div>
              <div className='v'>{formatTime(checkedAt)}</div>
            </div>
          </div>

          {downloading ? (
            <div className='lg-progress' aria-label={t('about.update.downloadProgress')}>
              <span className='lg-progress__bar' style={{ width: `${progressPercent}%` }} />
            </div>
          ) : null}

          <div className='about__actions'>
            {supportsUpdater ? (
              <button
                type='button'
                className='lg-btn lg-btn--primary'
                onClick={actionHandler}
                disabled={actionDisabled}>
                {checking || downloading ? (
                  <span className='lg-spin' aria-hidden='true' />
                ) : hasUpdate ? (
                  <IDownload aria-hidden='true' />
                ) : (
                  <IRefresh aria-hidden='true' />
                )}
                {actionLabel}
              </button>
            ) : null}
            <button
              type='button'
              className='lg-btn lg-btn--ghost'
              onClick={() => {
                void openContactLink(RELEASE_PAGE_URL, t);
              }}>
              <IExternal aria-hidden='true' />
              {t('about.openReleasePage')}
            </button>
            <span className={`about__msg${errorMessage ? ' about__msg--error' : ''}`}>
              {errorMessage ||
                (downloading ? `${t('about.update.downloadProgress')} ${progressPercent}%` : heroTitle)}
            </span>
          </div>

          <div>
            <div className='lg-eyebrow' style={{ marginBottom: 8 }}>
              {t('about.releaseNotesTitle')}
            </div>
            <div className='about__notes'>{releaseNotesBody || t('about.project.featureBody')}</div>
          </div>
        </div>

        <div className='lg-card lg-card--glass lg-rise' style={{ '--i': 2 }}>
          <div className='lg-card__head'>
            <span className='lg-card__icon'>
              <IChat />
            </span>
            <div>
              <h3 className='lg-card__title'>{t('about.contactCardTitle')}</h3>
              <p className='lg-card__sub'>{t('about.contactCardSub')}</p>
            </div>
          </div>
          <div className='about__contacts'>
            {contactItems.map((item) => (
              <div key={item.key} className='about__contact'>
                <span className='lg-card__icon' aria-hidden='true'>
                  {item.icon}
                </span>
                <div>
                  <div className='k'>{item.label}</div>
                  <div className='v'>{item.value}</div>
                </div>
                <button
                  type='button'
                  className='lg-btn lg-btn--sm'
                  onClick={() => {
                    void item.action();
                  }}>
                  {item.actionLabel}
                </button>
              </div>
            ))}
          </div>
          <p className='about__note'>{t('about.projectNote')}</p>
        </div>
      </div>
    </>
  );
}
