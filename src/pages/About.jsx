import { motion } from 'framer-motion';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ChatBubbleMessage, CircleInfo, Dock, GamingPad, Globe } from '../icons';
import { useUpdater } from '../components/UpdateProvider';
import { APP_VERSION_LABEL, RELEASE_PAGE_URL } from '../constants/version';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { useI18n } from '../i18n/I18nProvider';
import { showError } from '../utils/toast';
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
const DISCORD_URL = 'https://discord.gg/cWB49jCfdP';
const EMAIL_ADDRESS = 'huruiw@outlook.com';

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

export default function About() {
  const { locale, t } = useI18n();
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
  const contactItems = [
    {
      key: 'discord',
      label: t('about.project.contactDiscord'),
      value: 'discord.gg/cWB49jCfdP',
      href: DISCORD_URL,
    },
    {
      key: 'email',
      label: t('about.project.contactEmail'),
      value: EMAIL_ADDRESS,
      href: `mailto:${EMAIL_ADDRESS}`,
    },
  ];

  return (
    <div className='flex h-full flex-col gap-6'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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

        <div className='about-update-grid mt-5'>
          <div className='tool-subcard min-w-0 p-4'>
            <div className='tool-caption'>{t('about.update.currentVersion')}</div>
            <div className='tool-card-title mt-2'>{versionLabel}</div>
          </div>
          <div className='tool-subcard min-w-0 p-4'>
            <div className='tool-caption'>{t('about.update.latestVersion')}</div>
            <div className='tool-card-title mt-2'>{latestVersionLabel}</div>
          </div>
          <div className='tool-subcard min-w-0 p-4'>
            <div className='tool-caption'>{t('about.update.releaseDate')}</div>
            <div className='tool-card-title mt-2'>{formatReleaseDate(releaseDate)}</div>
          </div>
          <div className='tool-subcard min-w-0 p-4'>
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
      </motion.section>

      <motion.section
        className='dota-card tool-rise p-6'
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <CircleInfo className='tool-section-head__icon' />
              <h3 className='tool-card-title'>{t('about.project.title')}</h3>
            </div>
          </div>
        </div>
        <p className='tool-body tool-section-summary'>{t('about.project.summary')}</p>

        <div className='mt-4 rounded-2xl border border-[rgba(205,218,237,0.96)] bg-[rgba(248,251,255,0.9)] p-4 shadow-[0_10px_24px_rgba(27,42,72,0.04)]'>
          <div className='flex items-center gap-2'>
            <span className='tool-inline-icon-shell' aria-hidden='true'>
              <ChatBubbleMessage className='h-3.5 w-3.5 stroke-zinc-500' />
            </span>
            <span className='tool-caption'>{t('about.project.contactTitle')}</span>
          </div>
          <div className='mt-3 flex flex-wrap gap-3'>
            {contactItems.map((item) => (
              <button
                key={item.key}
                type='button'
                onClick={() => {
                  void openContactLink(item.href, t);
                }}
                className='min-w-[220px] flex-1 rounded-2xl border border-[rgba(196,210,233,0.96)] bg-[rgba(255,255,255,0.94)] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] transition-all duration-150 hover:-translate-y-[1px] hover:border-[rgba(157,181,229,0.98)] hover:bg-[rgba(252,254,255,0.98)]'>
                <div className='text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#7a89a1]'>{item.label}</div>
                <div className='mt-1 text-[14px] font-semibold text-[#2d3d59]'>{item.value}</div>
              </button>
            ))}
          </div>
        </div>

        <div className='about-project-grid mt-5'>
          <div className='tool-subcard min-w-0 p-5'>
            <div className='flex items-center gap-2'>
              <CircleInfo className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('about.project.introTitle')}</span>
            </div>
            <p className='tool-body mt-3'>{t('about.project.introBody')}</p>
          </div>

          <div className='tool-subcard min-w-0 p-5'>
            <div className='flex items-center gap-2'>
              <GamingPad className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('about.project.featureTitle')}</span>
            </div>
            <p className='tool-body mt-3'>{t('about.project.featureBody')}</p>
          </div>

          <div className='tool-subcard min-w-0 p-5'>
            <div className='flex items-center gap-2'>
              <Globe className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('about.project.roadmapTitle')}</span>
            </div>
            <p className='tool-body mt-3'>{t('about.project.roadmapBody')}</p>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
