import { useEffect, useMemo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ArrowRight, AT, ChatBubbleMessage, CircleInfo, Dock, GamingPad, Globe } from '../icons';
import PageHeader from '../components/PageHeader';
import { useUpdater } from '../components/UpdateProvider';
import { APP_VERSION_LABEL, RELEASE_PAGE_URL } from '../constants/version';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { DEFAULT_PUBLIC_SITE_CONFIG, loadPublicSiteConfig } from '../services/publicSiteConfig';
import { useI18n } from '../i18n/I18nProvider';
import { showError, showInfo, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

const stripLeadingMarkdownHeading = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

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

const normalizeReleaseNotes = (value) => stripLeadingMarkdownHeading(value).replace(/\n{3,}/g, '\n\n').trim();

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
  if (typeof document === 'undefined') {
    return false;
  }

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
        // Fall through to browser clipboard helpers.
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        showSuccess(t('about.project.contactQqCopied'));
        return;
      } catch {
        // Some preview/browser contexts expose the clipboard API but deny permission.
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
      if (!disposed) {
        setPublicSiteConfig(config);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp) {
      return t('common.notChecked');
    }
    try {
      return new Date(timestamp).toLocaleString(locale);
    } catch {
      return t('common.notChecked');
    }
  };

  const formatReleaseDate = (value) => {
    if (!value) {
      return t('common.unknown');
    }
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return t('common.unknown');
      }
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
  const shouldShowReleaseNotes = hasUpdate && Boolean(releaseNotesBody);

  const contactItems = useMemo(() => {
    const contact = publicSiteConfig?.contact || DEFAULT_PUBLIC_SITE_CONFIG.contact;

    return [
      {
        key: 'discord',
        icon: ChatBubbleMessage,
        label: t('about.project.contactDiscord'),
        value: contact.discordUrl.replace(/^https?:\/\//, ''),
        hint: t('about.project.contactDiscordHint'),
        actionLabel: t('about.project.contactActionOpen'),
        action: () => openContactLink(contact.discordUrl, t),
      },
      {
        key: 'qq-group',
        icon: Dock,
        label: t('about.project.contactQqGroup'),
        value: contact.qqGroup,
        hint: t('about.project.contactQqHint'),
        actionLabel: t('about.project.contactActionCopy'),
        action: () => copyContactValue(contact.qqGroup, t),
      },
      {
        key: 'email',
        icon: AT,
        label: t('about.project.contactEmail'),
        value: contact.email,
        hint: t('about.project.contactEmailHint'),
        actionLabel: t('about.project.contactActionOpen'),
        action: () => openContactLink(`mailto:${contact.email}`, t),
      },
    ];
  }, [publicSiteConfig, t]);

  return (
    <div className='page-stack about-page about-page--ops'>
      <PageHeader
        eyebrow={t('sidebar.nav.about')}
        meta={<span className='tool-pill'>{versionLabel}</span>}
        title={t('about.project.title')}
        summary={t('about.project.summary')}
        icon={CircleInfo}
        aside={
          <div className='page-header__badge-cluster'>
            <span className='tool-pill'>{latestVersionLabel}</span>
            {hasUpdate ? <span className='tool-pill tool-pill--accent'>{actionLabel}</span> : null}
          </div>
        }
      />

      <section className='about-panel about-update-panel about-update-panel--ops'>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <Dock className='tool-section-head__icon' />
              <h2 className='tool-card-title'>{t('about.update.title')}</h2>
            </div>
            <p className='tool-body tool-section-summary'>{t('about.update.summary')}</p>
          </div>

          {supportsUpdater ? (
            <button
              type='button'
              onClick={actionHandler}
              disabled={actionDisabled}
              className={`desktop-tight-button w-full justify-center whitespace-nowrap px-4 sm:w-auto sm:min-w-[132px] ${hasUpdate ? 'tool-btn-primary' : 'tool-btn'} ${actionDisabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {actionLabel}
            </button>
          ) : null}
        </div>

        <div className='about-update-grid about-update-grid--ops mt-5'>
          <div className='tool-subcard about-update-stat min-w-0 p-4'>
            <div className='tool-caption'>{t('about.update.currentVersion')}</div>
            <div className='tool-card-title mt-2'>{versionLabel}</div>
          </div>
          <div className='tool-subcard about-update-stat min-w-0 p-4'>
            <div className='tool-caption'>{t('about.update.latestVersion')}</div>
            <div className='tool-card-title mt-2'>{latestVersionLabel}</div>
          </div>
          <div className='tool-subcard about-update-stat min-w-0 p-4'>
            <div className='tool-caption'>{t('about.update.releaseDate')}</div>
            <div className='tool-card-title mt-2'>{formatReleaseDate(releaseDate)}</div>
          </div>
          <div className='tool-subcard about-update-stat min-w-0 p-4'>
            <div className='tool-caption'>{t('about.update.checkedAt')}</div>
            <div className='tool-body mt-2 break-words'>{formatTime(checkedAt)}</div>
          </div>
        </div>

        <div className='mt-4 space-y-3'>
          {!supportsUpdater ? (
            <div className='rounded-2xl border border-[rgba(205,216,230,0.94)] bg-[rgba(248,250,253,0.9)] p-4 text-sm text-zinc-600'>
              {t('about.update.previewOnly')}
            </div>
          ) : null}

          {hasUpdate ? (
            <div className='rounded-2xl border border-[rgba(252,202,212,0.94)] bg-[rgba(255,241,245,0.96)] p-4 text-sm text-red-600'>
              {manualUpdateRequired
                ? t('about.update.manualUpdateFound', { version: latestVersionLabel })
                : t('about.update.updateFound', { version: latestVersionLabel })}
            </div>
          ) : null}

          {shouldShowReleaseNotes ? (
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('about.update.releaseNotes')}</div>
              <div className='mt-3 whitespace-pre-line break-words text-[15px] leading-[1.78] text-[#5a6b84]'>
                {releaseNotesBody}
              </div>
            </div>
          ) : null}

          {downloading ? (
            <div className='tool-subcard p-4'>
              <div className='flex items-center justify-between text-xs font-semibold text-blue-700'>
                <span>{t('about.update.downloadProgress')}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className='mt-3 h-2 rounded-full bg-blue-100'>
                <div className='h-2 rounded-full bg-blue-600 transition-all' style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className='rounded-2xl border border-[rgba(252,202,212,0.94)] bg-[rgba(255,241,245,0.96)] p-4 text-sm text-red-600 break-words'>
              {errorMessage}
            </div>
          ) : null}
        </div>
      </section>

      <section className='about-panel about-panel--hub'>
        <div className='about-hub'>
          <div className='about-hub__contacts'>
            <div className='tool-section-head'>
              <div className='tool-section-head__main'>
                <div className='tool-section-head__title-row'>
                  <ChatBubbleMessage className='tool-section-head__icon' />
                  <h2 className='tool-card-title'>{t('about.project.contactTitle')}</h2>
                </div>
                <p className='tool-body tool-section-summary'>{t('about.project.introBody')}</p>
              </div>
            </div>

            <div className='about-contact-list mt-5'>
              {contactItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.key}
                    type='button'
                    onClick={() => {
                      void item.action();
                    }}
                    className='about-contact-row'>
                    <div className='about-contact-row__identity'>
                      <span className='about-contact-row__icon' aria-hidden='true'>
                        <Icon className='h-4 w-4 stroke-current' />
                      </span>
                      <div className='about-contact-row__copy'>
                        <div className='about-contact-row__label'>{item.label}</div>
                        <div className='about-contact-row__value'>{item.value}</div>
                        <div className='about-contact-row__hint'>{item.hint}</div>
                      </div>
                    </div>

                    <span className='about-contact-row__action'>
                      {item.actionLabel}
                      <ArrowRight className='h-4 w-4 stroke-current' />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className='about-project-grid about-project-grid--ops mt-0'>
            <div className='tool-subcard about-project-card min-w-0 p-5'>
              <div className='flex items-center gap-2'>
                <CircleInfo className='h-4 w-4 stroke-zinc-500' />
                <span className='tool-caption'>{t('about.project.introTitle')}</span>
              </div>
              <p className='tool-body mt-3'>{t('about.project.introBody')}</p>
            </div>

            <div className='tool-subcard about-project-card min-w-0 p-5'>
              <div className='flex items-center gap-2'>
                <GamingPad className='h-4 w-4 stroke-zinc-500' />
                <span className='tool-caption'>{t('about.project.featureTitle')}</span>
              </div>
              <p className='tool-body mt-3'>{t('about.project.featureBody')}</p>
            </div>

            <div className='tool-subcard about-project-card min-w-0 p-5'>
              <div className='flex items-center gap-2'>
                <Globe className='h-4 w-4 stroke-zinc-500' />
                <span className='tool-caption'>{t('about.project.roadmapTitle')}</span>
              </div>
              <p className='tool-body mt-3'>{t('about.project.roadmapBody')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
