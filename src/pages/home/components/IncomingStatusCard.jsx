import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../../../components/StoreProvider';
import PanelCard from '../../../components/PanelCard';
import StatusChip from '../../../components/StatusChip';
import IncomingCalibrationModal from '../../../components/IncomingCalibrationModal';
import IncomingAdvancedSettingsModal from '../../../components/IncomingAdvancedSettingsModal';
import { ChatBubbleMessage } from '../../../icons';
import { hasTauriRuntime } from '../../../services/tauriRuntime';
import {
  PERMISSION_STATES,
  getIncomingStatus,
  requestScreenRecordingPermission,
  setIncomingEnabled,
  setIncomingOverlayClickThrough,
} from '../../../services/incomingService';
import { showError, showInfo, showSuccess } from '../../../utils/toast';
import { toErrorMessage } from '../../../utils/error';
import { useI18n } from '../../../i18n/I18nProvider';

const STATUS_NOTE_EVENTS = [
  'incoming:permission_required',
  'incoming:region_required',
  'incoming:capture_error',
  'incoming:ocr_error',
  'incoming:fatal',
];

export default function IncomingStatusCard() {
  const { settings, syncSettings } = useStore();
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(false);
  const [clickPending, setClickPending] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const persistedEnabled = Boolean(settings?.incoming_enabled);
  const gameScene = settings?.game_scene || 'dota2';
  const region = settings?.incoming_regions?.[gameScene] || null;
  const hasRegion = Boolean(region);
  const clickThrough = Boolean(settings?.incoming_overlay?.click_through);

  const refreshStatus = useCallback(async () => {
    if (!hasTauriRuntime()) {
      setStatus(null);
      return;
    }
    try {
      const next = await getIncomingStatus();
      setStatus(next);
    } catch (error) {
      console.warn('failed to load incoming status', error);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, persistedEnabled, gameScene, hasRegion]);

  // The pipeline emits status events when it can't run (no region, permission
  // denied, capture failure). Without listening for them the home card would
  // silently sit on "Ready" while nothing actually translates — exactly the
  // class of "Windows doesn't show any translation" feedback we got. Surface
  // them as toasts so the user sees the cause.
  useEffect(() => {
    if (!hasTauriRuntime()) return undefined;
    let cancelled = false;
    const unlisteners = [];
    (async () => {
      for (const eventName of STATUS_NOTE_EVENTS) {
        try {
          const unlisten = await listen(eventName, (event) => {
            if (cancelled) return;
            const payload = event.payload;
            const message = typeof payload === 'string' && payload.trim()
              ? payload
              : t('home.incoming.statusNote', { event: eventName });
            showError(message);
            void refreshStatus();
          });
          if (cancelled) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        } catch (error) {
          console.warn(`failed to listen for ${eventName}`, error);
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const u of unlisteners) {
        try {
          u();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [refreshStatus, t]);

  const permission = status?.permission || PERMISSION_STATES.UNKNOWN;
  const permissionMissing = permission === PERMISSION_STATES.DENIED;
  const needsRegion = persistedEnabled && !hasRegion;
  const needsPermission = persistedEnabled && permissionMissing;

  const toneAndLabel = (() => {
    if (!persistedEnabled) {
      return { tone: 'neutral', label: t('home.incoming.statusDisabled') };
    }
    if (needsPermission) {
      return { tone: 'warning', label: t('home.incoming.statusPermission') };
    }
    if (needsRegion) {
      return { tone: 'warning', label: t('home.incoming.statusNeedsRegion') };
    }
    return { tone: 'success', label: t('home.incoming.statusActive') };
  })();

  const handleToggle = async () => {
    if (pending) {
      return;
    }
    const nextEnabled = !persistedEnabled;
    setPending(true);
    try {
      if (hasTauriRuntime()) {
        const latest = await setIncomingEnabled(nextEnabled);
        if (latest && typeof latest === 'object') {
          await syncSettings(latest);
        }
      } else {
        await syncSettings({ ...(settings || {}), incoming_enabled: nextEnabled });
      }

      if (nextEnabled) {
        showSuccess(t('home.incoming.toggleEnabledSuccess'));
        if (!hasRegion) {
          showInfo(t('home.incoming.regionHintToast', { scene: gameScene }));
        } else if (permissionMissing) {
          showInfo(t('home.incoming.permissionHintToast'));
        }
      } else {
        showSuccess(t('home.incoming.toggleDisabledSuccess'));
      }

      void refreshStatus();
    } catch (error) {
      showError(t('home.incoming.toggleFailed', { error: toErrorMessage(error) }));
    } finally {
      setPending(false);
    }
  };

  const handleClickThroughToggle = async () => {
    if (clickPending) return;
    const next = !clickThrough;
    setClickPending(true);
    try {
      if (hasTauriRuntime()) {
        const latest = await setIncomingOverlayClickThrough(next);
        if (latest && typeof latest === 'object') {
          await syncSettings(latest);
        }
      } else {
        await syncSettings({
          ...(settings || {}),
          incoming_overlay: { ...(settings?.incoming_overlay || {}), click_through: next },
        });
      }
      showSuccess(
        next ? t('home.incoming.clickThroughLocked') : t('home.incoming.clickThroughUnlocked'),
      );
    } catch (error) {
      showError(t('home.incoming.clickThroughFailed', { error: toErrorMessage(error) }));
    } finally {
      setClickPending(false);
    }
  };

  const handleCalibrationSaved = useCallback(async () => {
    // Pull latest settings via existing store path; the command returned
    // them already but a refresh keeps the React state consistent.
    void refreshStatus();
  }, [refreshStatus]);

  const handleRequestPermission = useCallback(async () => {
    try {
      await requestScreenRecordingPermission();
      showInfo(t('home.incoming.permissionRequested'));
      void refreshStatus();
    } catch (error) {
      showError(t('home.incoming.permissionRequestFailed', { error: toErrorMessage(error) }));
    }
  }, [refreshStatus, t]);

  const toggleShortcut = settings?.incoming_toggle_hotkey?.shortcut || '';
  const clickThroughShortcut = settings?.incoming_click_through_hotkey?.shortcut || '';

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}>
        <PanelCard
          className='home-stat-card tool-rise'
          icon={<ChatBubbleMessage className='home-stat-card__header-icon' />}
          title={t('home.incoming.title')}
          actions={<StatusChip label={toneAndLabel.label} tone={toneAndLabel.tone} />}
          bodyClassName='home-stat-card__body'>
          <div className='home-top-copy home-stat-card__copy home-stat-card__copy--single'>
            <p className='tool-body'>{t('home.incoming.desc')}</p>
            <div className='home-incoming-actions'>
              <button
                type='button'
                className='home-incoming-actions__btn'
                onClick={() => setCalibrationOpen(true)}>
                {hasRegion
                  ? t('home.incoming.calibrateRegionEdit', {
                      x: region.bounds?.x ?? 0,
                      y: region.bounds?.y ?? 0,
                      w: region.bounds?.w ?? 0,
                      h: region.bounds?.h ?? 0,
                    })
                  : t('home.incoming.calibrateRegion')}
              </button>
              <button
                type='button'
                className={`home-incoming-actions__btn ${
                  clickThrough ? 'home-incoming-actions__btn--active' : ''
                }`}
                onClick={handleClickThroughToggle}
                disabled={clickPending}
                aria-pressed={clickThrough}>
                {clickThrough
                  ? t('home.incoming.clickThroughOn')
                  : t('home.incoming.clickThroughOff')}
              </button>
              {permissionMissing && (
                <button
                  type='button'
                  className='home-incoming-actions__btn home-incoming-actions__btn--warning'
                  onClick={handleRequestPermission}>
                  {t('home.incoming.grantPermission')}
                </button>
              )}
              <button
                type='button'
                className='home-incoming-actions__btn'
                onClick={() => setAdvancedOpen(true)}>
                {t('home.incoming.advancedSettings')}
              </button>
            </div>
            {(toggleShortcut || clickThroughShortcut) && (
              <p className='home-incoming-hotkey-hint'>
                {toggleShortcut && (
                  <span>
                    {t('home.incoming.hotkeyToggleLabel')}{' '}
                    <kbd>{toggleShortcut}</kbd>
                  </span>
                )}
                {clickThroughShortcut && (
                  <span>
                    {t('home.incoming.hotkeyLockLabel')}{' '}
                    <kbd>{clickThroughShortcut}</kbd>
                  </span>
                )}
              </p>
            )}
          </div>

          <div className='home-top-actions'>
            <div className='tool-control-slot home-top-control-slot'>
              <div className='home-top-control-shell'>
                <button
                  type='button'
                  onClick={handleToggle}
                  disabled={pending}
                  aria-pressed={persistedEnabled}
                  className={`home-status-toggle home-top-control-frame ${
                    persistedEnabled ? 'home-status-toggle--enabled' : 'home-status-toggle--paused'
                  } ${pending ? 'cursor-not-allowed opacity-70' : ''}`}>
                  <span className='flex min-w-0 items-center gap-2.5'>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        persistedEnabled ? 'bg-emerald-500' : 'bg-zinc-400'
                      }`}
                    />
                    <span className='tool-control-text whitespace-nowrap'>
                      {persistedEnabled ? t('common.enabled') : t('common.paused')}
                    </span>
                  </span>

                  <span
                    className={`home-status-switch ${
                      persistedEnabled ? 'home-status-switch--enabled' : 'home-status-switch--paused'
                    }`}>
                    <span
                      className={`home-status-switch-thumb ${
                        persistedEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </PanelCard>
      </motion.div>

      <IncomingCalibrationModal
        open={calibrationOpen}
        onClose={() => setCalibrationOpen(false)}
        gameScene={gameScene}
        currentRegion={region}
        onSaved={handleCalibrationSaved}
      />

      <IncomingAdvancedSettingsModal
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        settings={settings}
        onChange={async (next) => {
          if (next && typeof next === 'object') {
            await syncSettings(next);
          }
        }}
      />
    </>
  );
}
