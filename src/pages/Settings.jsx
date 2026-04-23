import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dock, Globe, KeyboardAlt, Server, Sparkles, Spinner } from '../icons';
import PageHeader from '../components/PageHeader';
import { useStore } from '../components/StoreProvider';
import { LANGUAGE_OPTIONS, getLanguageMeta } from '../constants/languages';
import { DEFAULT_GAME_SCENE, getGameSceneLabel } from '../constants/gameScenes';
import {
  buildHotkeyFromKeyCodes,
  defaultIncomingChatHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  isModifierKeyCode,
  normalizeModifier,
} from '../constants/hotkeys';
import { useI18n } from '../i18n/I18nProvider';
import { hasTauriRuntime, invokeCommand } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

const formatPreview = (codes) =>
  codes
    .map((code) => (isModifierKeyCode(code) ? formatModifierLabel(normalizeModifier(code)) : formatMainKeyLabel(code)))
    .join(' + ');

function IncomingHotkeyRecorder({ settings, updateSettings, syncSettings, copy }) {
  const [recording, setRecording] = useState(false);
  const [capturedCodes, setCapturedCodes] = useState([]);
  const codesRef = useRef([]);
  const committingRef = useRef(false);

  const stopRecording = useCallback(() => {
    codesRef.current = [];
    setCapturedCodes([]);
    setRecording(false);
    committingRef.current = false;
  }, []);

  const commitHotkey = useCallback(async () => {
    if (committingRef.current) {
      return;
    }

    committingRef.current = true;
    const keys = [...codesRef.current];
    if (keys.length === 0) {
      stopRecording();
      return;
    }

    try {
      if (hasTauriRuntime()) {
        const latest = await invokeCommand('update_incoming_chat_shortcut', { keys });
        await syncSettings(latest);
        showSuccess(copy.hotkeySetSuccess);
      } else {
        const hotkey = buildHotkeyFromKeyCodes(keys);
        await updateSettings({ incoming_chat_hotkey: hotkey });
        showSuccess(copy.hotkeyPreviewSuccess);
      }
    } catch (error) {
      showError(copy.hotkeySetFailed(toErrorMessage(error)));
    } finally {
      stopRecording();
    }
  }, [copy, stopRecording, syncSettings, updateSettings]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!recording) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopRecording();
        return;
      }

      if (!event.code || codesRef.current.includes(event.code)) {
        return;
      }

      codesRef.current = [...codesRef.current, event.code];
      setCapturedCodes(codesRef.current);
    },
    [recording, stopRecording],
  );

  const handleKeyUp = useCallback(
    (event) => {
      if (!recording) {
        return;
      }

      if (!codesRef.current.some((code) => !isModifierKeyCode(code))) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void commitHotkey();
    },
    [commitHotkey, recording],
  );

  useEffect(() => {
    if (!recording) {
      return undefined;
    }

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [handleKeyDown, handleKeyUp, recording]);

  const hotkeyDisplay = useMemo(() => {
    if (recording && capturedCodes.length === 0) {
      return <Spinner className='h-5 w-5 animate-spin text-zinc-400' />;
    }

    if (recording) {
      return formatPreview(capturedCodes);
    }

    return settings?.incoming_chat_hotkey?.shortcut || defaultIncomingChatHotkeyLabel();
  }, [capturedCodes, recording, settings?.incoming_chat_hotkey?.shortcut]);

  return (
    <button
      type='button'
      onClick={() => {
        if (recording) {
          stopRecording();
          return;
        }
        setCapturedCodes([]);
        codesRef.current = [];
        setRecording(true);
      }}
      className='tool-subcard settings-hotkey-card flex min-h-[112px] w-full flex-col items-start justify-between gap-4 p-4 text-left transition-all duration-200 hover:border-[rgba(129,163,255,0.58)]'>
      <div className='flex items-center gap-3'>
        <span className='workspace-header__icon h-10 w-10 min-w-[40px]'>
          <KeyboardAlt className='h-5 w-5 stroke-current' />
        </span>
        <div>
          <div className='tool-card-title'>{copy.hotkeyTitle}</div>
          <div className='tool-body mt-1'>{recording ? copy.hotkeyRecording : copy.hotkeyHint}</div>
        </div>
      </div>
      <div className='tool-chip min-w-[120px] justify-center self-stretch text-center sm:self-start'>
        {typeof hotkeyDisplay === 'string' ? hotkeyDisplay : hotkeyDisplay}
      </div>
    </button>
  );
}

export default function Settings() {
  const { settings, loading, updateSettings, syncSettings } = useStore();
  const { locale, t } = useI18n();
  const [actionLoading, setActionLoading] = useState({
    translate: false,
    calibrate: false,
    clear: false,
  });
  const resolvedSettings = settings || {};

  const incomingCopy = useMemo(
    () => ({
      title: t('settings.incoming.title'),
      summary: t('settings.incoming.summary'),
      enabledLabel: t('settings.incoming.enabledLabel'),
      modeLabel: t('settings.incoming.modeLabel'),
      autoMode: t('settings.incoming.autoMode'),
      manualMode: t('settings.incoming.manualMode'),
      targetLanguage: t('settings.incoming.targetLanguage'),
      overlayLabel: t('settings.incoming.overlayLabel'),
      modeHintAuto: t('settings.incoming.modeHintAuto'),
      modeHintManual: t('settings.incoming.modeHintManual'),
      hotkeyTitle: t('settings.incoming.hotkeyTitle'),
      hotkeyHint: t('settings.incoming.hotkeyHint'),
      hotkeyRecording: t('settings.incoming.hotkeyRecording'),
      hotkeySetSuccess: t('settings.incoming.hotkeySetSuccess'),
      hotkeyPreviewSuccess: t('settings.incoming.hotkeyPreviewSuccess'),
      hotkeySetFailed: (error) => t('settings.incoming.hotkeySetFailed', { error }),
      translateNow: t('settings.incoming.translateNow'),
      calibrate: t('settings.incoming.calibrate'),
      clearCalibration: t('settings.incoming.clearCalibration'),
      clearCalibrationSuccess: t('settings.incoming.clearCalibrationSuccess'),
      actionFailed: (error) => t('settings.incoming.actionFailed', { error }),
      roiStatus: t('settings.incoming.roiStatus'),
      roiSaved: t('settings.incoming.roiSaved'),
      roiDefault: t('settings.incoming.roiDefault'),
      desktopOnly: t('settings.incoming.desktopOnly'),
    }),
    [t],
  );

  const serviceStatus = useMemo(() => {
    if (loading) {
      return {
        label: t('settings.loading'),
        tone: 'text-zinc-600',
        hint: t('settings.loadingHint'),
      };
    }

    if (resolvedSettings.app_enabled === false) {
      return {
        label: t('settings.paused'),
        tone: 'text-amber-600',
        hint: t('settings.pausedHint'),
      };
    }

    return {
      label: t('settings.enabled'),
      tone: 'text-emerald-600',
      hint: t('settings.enabledHint'),
    };
  }, [loading, resolvedSettings.app_enabled, t]);

  const from = resolvedSettings.translation_from || 'zh';
  const to = resolvedSettings.translation_to || 'en';
  const scene = getGameSceneLabel(resolvedSettings.game_scene || DEFAULT_GAME_SCENE, locale);
  const modeKey = `translate.mode.${resolvedSettings.translation_mode || 'auto'}.title`;
  const modeLabel = t(modeKey) === modeKey ? t('translate.mode.auto.title') : t(modeKey);
  const incomingMode = resolvedSettings.incoming_chat_mode || 'auto';
  const incomingEnabled = Boolean(resolvedSettings.incoming_chat_enabled);
  const overlayEnabled = resolvedSettings.incoming_chat_overlay_enabled !== false;
  const roiSaved = Boolean(resolvedSettings.incoming_chat_roi_override);

  const patchIncomingSettings = useCallback(
    async (patch) => {
      try {
        await updateSettings(patch);
      } catch (error) {
        showError(incomingCopy.actionFailed(toErrorMessage(error)));
      }
    },
    [incomingCopy, updateSettings],
  );

  const runIncomingAction = useCallback(
    async (type) => {
      if (!hasTauriRuntime()) {
        showError(incomingCopy.desktopOnly);
        return;
      }

      const commandMap = {
        translate: 'start_incoming_chat_selection',
        calibrate: 'start_incoming_chat_roi_calibration',
        clear: 'clear_incoming_chat_roi_override',
      };

      const command = commandMap[type];
      if (!command) {
        return;
      }

      setActionLoading((current) => ({ ...current, [type]: true }));
      try {
        const response = await invokeCommand(command);
        if (type === 'clear') {
          await syncSettings(response);
          showSuccess(incomingCopy.clearCalibrationSuccess);
        }
      } catch (error) {
        showError(incomingCopy.actionFailed(toErrorMessage(error)));
      } finally {
        setActionLoading((current) => ({ ...current, [type]: false }));
      }
    },
    [incomingCopy, syncSettings],
  );

  return (
    <div className='page-stack settings-page'>
      <PageHeader
        eyebrow={t('sidebar.nav.settings')}
        meta={<span className='tool-pill'>{scene}</span>}
        title={t('settings.title')}
        summary={t('settings.summary')}
        icon={Server}
        aside={
          <div className='page-header__badge-cluster' aria-live='polite'>
            <span className={`tool-pill ${resolvedSettings.app_enabled === false ? '' : 'workspace-pill--success'}`}>
              {serviceStatus.label}
            </span>
            <span className='tool-pill'>{modeLabel}</span>
          </div>
        }
      />

      <section className='settings-command-board settings-command-board--ops'>
        <div className='settings-command-board__lead'>
          <div className='settings-command-board__copy'>
            <div className='workspace-section-label'>{t('settings.overviewBadge')}</div>
            <h2 className='workspace-section-title'>{t('settings.section.status')}</h2>
            <p className='tool-body'>{serviceStatus.hint}</p>
          </div>

          <div className='settings-command-board__status settings-command-board__status--ops'>
            <span
              className={`settings-command-board__status-dot ${
                resolvedSettings.app_enabled === false
                  ? 'settings-command-board__status-dot--paused'
                  : 'settings-command-board__status-dot--enabled'
              }`}
            />
            <div>
              <div className='tool-caption'>{t('settings.statusCard')}</div>
              <div className={`tool-card-title mt-2 ${serviceStatus.tone}`}>{serviceStatus.label}</div>
            </div>
          </div>
        </div>

        <div className='settings-command-board__grid settings-command-board__grid--ops'>
          <article className='settings-snapshot settings-snapshot--ops'>
            <span className='tool-caption'>{t('settings.defaultLanguage')}</span>
            <strong className='settings-snapshot__value'>
              {getLanguageMeta(from, locale).label} {'->'} {getLanguageMeta(to, locale).label}
            </strong>
            <p className='tool-body'>{t('settings.defaultLanguageHint')}</p>
          </article>

          <article className='settings-snapshot settings-snapshot--ops'>
            <span className='tool-caption'>{t('settings.strategy.scene')}</span>
            <strong className='settings-snapshot__value'>{scene}</strong>
            <p className='tool-body'>{t('settings.serviceSummary')}</p>
          </article>

          <article className='settings-snapshot settings-snapshot--ops'>
            <span className='tool-caption'>{t('settings.strategy.tone')}</span>
            <strong className='settings-snapshot__value'>{modeLabel}</strong>
            <p className='tool-body'>{t('settings.strategy.hintBody')}</p>
          </article>
        </div>

        <div className='settings-command-board__hint settings-command-board__hint--ops'>
          <Sparkles className='h-4 w-4 stroke-zinc-500' />
          <div>
            <div className='tool-caption'>{t('settings.strategy.hintTitle')}</div>
            <p className='tool-body'>{t('settings.strategy.hintBody')}</p>
          </div>
        </div>
      </section>

      <section className='settings-incoming settings-incoming--ops'>
        <div className='tool-section-head'>
          <div className='tool-section-head__main'>
            <div className='tool-section-head__title-row'>
              <Dock className='tool-section-head__icon' />
              <h2 className='tool-card-title'>{incomingCopy.title}</h2>
            </div>
            <p className='tool-body tool-section-summary'>{incomingCopy.summary}</p>
          </div>

          <button
            type='button'
            onClick={() => {
              void patchIncomingSettings({ incoming_chat_enabled: !incomingEnabled });
            }}
            className={`tool-chip min-w-[156px] justify-center ${incomingEnabled ? 'workspace-pill--success' : ''}`}>
            {incomingCopy.enabledLabel}: {incomingEnabled ? t('common.enabled') : t('common.paused')}
          </button>
        </div>

        <div className='settings-incoming__overview settings-incoming__overview--ops'>
          <article className='settings-inline-stat settings-inline-stat--ops'>
            <span className='tool-caption'>{incomingCopy.modeLabel}</span>
            <strong className='settings-inline-stat__value'>
              {incomingMode === 'manual' ? incomingCopy.manualMode : incomingCopy.autoMode}
            </strong>
          </article>
          <article className='settings-inline-stat settings-inline-stat--ops'>
            <span className='tool-caption'>{incomingCopy.targetLanguage}</span>
            <strong className='settings-inline-stat__value'>
              {getLanguageMeta(
                resolvedSettings.incoming_chat_target_language || resolvedSettings.translation_from || 'zh',
                locale,
              ).label}
            </strong>
          </article>
          <article className='settings-inline-stat settings-inline-stat--ops'>
            <span className='tool-caption'>{incomingCopy.overlayLabel}</span>
            <strong className='settings-inline-stat__value'>
              {overlayEnabled ? t('common.enabled') : t('common.paused')}
            </strong>
          </article>
          <article className='settings-inline-stat settings-inline-stat--ops'>
            <span className='tool-caption'>{incomingCopy.roiStatus}</span>
            <strong className='settings-inline-stat__value'>
              {roiSaved ? incomingCopy.roiSaved : incomingCopy.roiDefault}
            </strong>
          </article>
        </div>

        <div className='settings-incoming__grid settings-incoming__grid--ops mt-6'>
          <div className='tool-subcard settings-control-card settings-control-card--ops p-4'>
            <div className='tool-caption'>{incomingCopy.modeLabel}</div>
            <div className='mt-3 flex flex-wrap gap-2'>
              {[
                { id: 'auto', label: incomingCopy.autoMode },
                { id: 'manual', label: incomingCopy.manualMode },
              ].map((option) => (
                <button
                  key={option.id}
                  type='button'
                  onClick={() => {
                    void patchIncomingSettings({ incoming_chat_mode: option.id });
                  }}
                  className={`tool-btn px-4 ${incomingMode === option.id ? 'tool-btn-primary' : ''}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <p className='tool-body mt-3'>
              {incomingMode === 'manual' ? incomingCopy.modeHintManual : incomingCopy.modeHintAuto}
            </p>
          </div>

          <div className='tool-subcard settings-control-card settings-control-card--ops p-4'>
            <div className='tool-caption'>{incomingCopy.targetLanguage}</div>
            <div className='mt-3 flex flex-col gap-3 sm:flex-row sm:items-center'>
              <select
                value={resolvedSettings.incoming_chat_target_language || resolvedSettings.translation_from || 'zh'}
                onChange={(event) => {
                  void patchIncomingSettings({ incoming_chat_target_language: event.target.value });
                }}
                className='tool-input'>
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.id} value={language.id}>
                    {getLanguageMeta(language.id, locale).label}
                  </option>
                ))}
              </select>
              <button
                type='button'
                onClick={() => {
                  void patchIncomingSettings({ incoming_chat_overlay_enabled: !overlayEnabled });
                }}
                className={`tool-chip min-w-[156px] justify-center ${overlayEnabled ? 'workspace-pill--success' : ''}`}>
                {incomingCopy.overlayLabel}: {overlayEnabled ? t('common.enabled') : t('common.paused')}
              </button>
            </div>
          </div>

          <div className='tool-subcard settings-control-card settings-control-card--ops p-4'>
            <div className='tool-caption'>{incomingCopy.roiStatus}</div>
            <div className='tool-card-title mt-2 text-zinc-900'>{roiSaved ? incomingCopy.roiSaved : incomingCopy.roiDefault}</div>
            <p className='tool-body mt-2'>{t('settings.serviceSummary')}</p>
          </div>

          <div className='tool-subcard settings-control-card settings-control-card--ops p-4'>
            <div className='mb-3 flex items-center gap-2'>
              <Globe className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('settings.section.service')}</span>
            </div>
            <p className='tool-body'>{t('settings.strategy.hintBody')}</p>
          </div>
        </div>

        <div className='mt-4'>
          <IncomingHotkeyRecorder
            settings={settings}
            updateSettings={updateSettings}
            syncSettings={syncSettings}
            copy={incomingCopy}
          />
        </div>

        <div className='settings-incoming__actions settings-incoming__actions--ops mt-6'>
          <button
            type='button'
            onClick={() => {
              void runIncomingAction('translate');
            }}
            disabled={actionLoading.translate}
            className={`tool-btn-primary px-4 ${actionLoading.translate ? 'cursor-not-allowed opacity-70' : ''}`}>
            {actionLoading.translate ? t('common.saving') : incomingCopy.translateNow}
          </button>
          <button
            type='button'
            onClick={() => {
              void runIncomingAction('calibrate');
            }}
            disabled={actionLoading.calibrate}
            className={`tool-btn px-4 ${actionLoading.calibrate ? 'cursor-not-allowed opacity-70' : ''}`}>
            {actionLoading.calibrate ? t('common.saving') : incomingCopy.calibrate}
          </button>
          <button
            type='button'
            onClick={() => {
              void runIncomingAction('clear');
            }}
            disabled={actionLoading.clear || !roiSaved}
            className={`tool-btn tool-btn-danger px-4 ${actionLoading.clear || !roiSaved ? 'cursor-not-allowed opacity-60' : ''}`}>
            {actionLoading.clear ? t('common.saving') : incomingCopy.clearCalibration}
          </button>
        </div>
      </section>
    </div>
  );
}
