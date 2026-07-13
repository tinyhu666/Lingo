import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XClose,
  KeyboardAlt,
  Spinner,
  ISliders,
  ICheck,
  IAnchorR,
  IAnchorL,
  IAnchorT,
  IAnchorB,
} from '../icons';
import {
  buildHotkeyFromKeyCodes,
  defaultIncomingClickThroughHotkeyLabel,
  defaultIncomingToggleHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  isModifierKeyCode,
  normalizeModifier,
} from '../constants/hotkeys';
import {
  updateIncomingClickThroughHotkey,
  updateIncomingOverlayPreferences,
  updateIncomingToggleHotkey,
} from '../services/incomingService';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Power-user settings dialog — v0.8 .lg-modal repaint.
 *
 * Keeps the persisted prefs intact (opacity / font_size / max_lines /
 * fade_ms / show_original / click_through) and stores three new aux
 * settings — anchor edge, team-color toggle, source-text display mode —
 * as part of the same payload. The backend tolerates unknown keys via
 * `#[serde(default)]` so the persisted blob is forward-compatible.
 */

const ANCHORS = [
  { id: 'right', Icon: IAnchorR, labelKey: 'anchorRight' },
  { id: 'left', Icon: IAnchorL, labelKey: 'anchorLeft' },
  { id: 'top', Icon: IAnchorT, labelKey: 'anchorTop' },
  { id: 'bottom', Icon: IAnchorB, labelKey: 'anchorBottom' },
];

const SOURCE_MODES = [
  { id: 'always', labelKey: 'sourceAlways' },
  { id: 'hover', labelKey: 'sourceHover' },
  { id: 'never', labelKey: 'sourceNever' },
];

const DEFAULTS = {
  anchor: 'right',
  opacity: 0.78,
  fade_ms: 8000,
  show_original_mode: 'always',
  team_color: true,
};

const EMPTY_OVERLAY_PREFS = Object.freeze({});

function readPrefs(overlayPrefs) {
  return {
    anchor: overlayPrefs.anchor || DEFAULTS.anchor,
    opacity: overlayPrefs.opacity ?? DEFAULTS.opacity,
    fade_ms: overlayPrefs.fade_ms ?? DEFAULTS.fade_ms,
    show_original_mode:
      overlayPrefs.show_original_mode ||
      (overlayPrefs.show_original === false ? 'never' : DEFAULTS.show_original_mode),
    team_color:
      typeof overlayPrefs.team_color === 'boolean'
        ? overlayPrefs.team_color
        : DEFAULTS.team_color,
  };
}

export default function IncomingAdvancedSettingsModal({
  open,
  onClose,
  settings,
  onChange,
}) {
  const { t } = useI18n();
  const overlayPrefs = settings?.incoming_overlay || EMPTY_OVERLAY_PREFS;
  const [draftOverlayPrefs, setDraftOverlayPrefs] = useState(overlayPrefs);
  const latestPrefsRef = useRef(overlayPrefs);
  const persistedPrefsRef = useRef(overlayPrefs);
  const pendingWritesRef = useRef(0);
  const persistQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    if (pendingWritesRef.current > 0) return;
    latestPrefsRef.current = overlayPrefs;
    persistedPrefsRef.current = overlayPrefs;
    setDraftOverlayPrefs(overlayPrefs);
  }, [overlayPrefs]);

  const persist = useCallback(
    (next) => {
      pendingWritesRef.current += 1;

      const run = async () => {
        let succeeded = false;
        try {
          const latest = await updateIncomingOverlayPreferences(next);
          const persisted = latest?.incoming_overlay || next;
          persistedPrefsRef.current = persisted;
          if (latest && typeof latest === 'object') {
            await onChange?.(latest);
          }
          succeeded = true;

          if (pendingWritesRef.current === 1) {
            latestPrefsRef.current = persisted;
            setDraftOverlayPrefs(persisted);
          }
          return true;
        } catch (error) {
          showError(
            t('home.incoming.advanced.saveFailed', {
              error: toErrorMessage(error),
            }),
          );
          return false;
        } finally {
          pendingWritesRef.current -= 1;
          if (!succeeded && pendingWritesRef.current === 0) {
            latestPrefsRef.current = persistedPrefsRef.current;
            setDraftOverlayPrefs(persistedPrefsRef.current);
          }
        }
      };

      const queued = persistQueueRef.current.then(run, run);
      persistQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [onChange, t],
  );

  const commitPrefs = (next) => {
    latestPrefsRef.current = next;
    setDraftOverlayPrefs(next);
    return persist(next);
  };

  const setPref = (patch) => commitPrefs({ ...latestPrefsRef.current, ...patch });

  const handleResetDefaults = async () => {
    const saved = await commitPrefs({
      ...latestPrefsRef.current,
      anchor: DEFAULTS.anchor,
      opacity: DEFAULTS.opacity,
      fade_ms: DEFAULTS.fade_ms,
      show_original_mode: DEFAULTS.show_original_mode,
      show_original: true,
      team_color: DEFAULTS.team_color,
    });
    if (saved) {
      showSuccess(t('home.incoming.advanced.defaultsRestored'));
    }
  };

  const current = readPrefs(draftOverlayPrefs);
  const opacityPct = Math.round(current.opacity * 100);
  const fadeSec = Math.round(current.fade_ms / 1000);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='lg-modal-host'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}>
          <motion.div
            className='lg-modal'
            style={{ width: 540 }}
            role='dialog'
            aria-modal='true'
            aria-labelledby='incoming-advanced-title'
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}>
            <div className='lg-modal__head'>
              <div className='lg-card__icon'>
                <ISliders />
              </div>
              <div style={{ flex: 1 }}>
                <div id='incoming-advanced-title' className='lg-modal__title'>
                  {t('home.incoming.advanced.title')}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--lg-ink-3)',
                    marginTop: 2,
                  }}>
                  {t('home.incoming.advanced.subtitle')}
                </div>
              </div>
              <button
                type='button'
                className='lg-btn lg-btn--ghost lg-btn--sm'
                onClick={onClose}
                aria-label={t('home.incoming.advanced.close')}>
                <XClose style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div className='lg-modal__body'>
              {/* Anchor edge picker */}
              <div className='lg-field'>
                <label className='lg-field__label'>
                  {t('home.incoming.advanced.anchorLabel')}
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 6,
                  }}>
                  {ANCHORS.map((a) => {
                    const active = current.anchor === a.id;
                    const Icon = a.Icon;
                    return (
                      <button
                        key={a.id}
                        type='button'
                        aria-pressed={active}
                        onClick={() => setPref({ anchor: a.id })}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 4,
                          padding: '10px 6px',
                          borderRadius: 9,
                          background: active
                            ? 'rgba(112,133,250,.10)'
                            : 'var(--lg-surf-1)',
                          border: `1px solid ${
                            active ? 'rgba(112,133,250,.4)' : 'var(--lg-line-1)'
                          }`,
                          color: active ? '#4d39b8' : 'var(--lg-ink-2)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 11.5,
                        }}>
                        <Icon style={{ width: 20, height: 20 }} />{' '}
                        {t(`home.incoming.advanced.${a.labelKey}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transparency slider */}
              <div className='lg-field'>
                <label className='lg-field__label'>
                  {t('home.incoming.advanced.opacity')}
                </label>
                <div className='lg-field__row'>
                  <input
                    type='range'
                    className='lg-slider'
                    aria-label={t('home.incoming.advanced.opacity')}
                    value={opacityPct}
                    min={20}
                    max={100}
                    step={1}
                    onChange={(e) =>
                      setPref({ opacity: Number(e.target.value) / 100 })
                    }
                  />
                  <span className='lg-num'>{opacityPct}%</span>
                </div>
              </div>

              {/* Duration slider */}
              <div className='lg-field'>
                <label className='lg-field__label'>
                  {t('home.incoming.advanced.duration')}
                </label>
                <div className='lg-field__row'>
                  <input
                    type='range'
                    className='lg-slider'
                    aria-label={t('home.incoming.advanced.duration')}
                    value={fadeSec}
                    min={3}
                    max={20}
                    step={1}
                    onChange={(e) =>
                      setPref({ fade_ms: Number(e.target.value) * 1000 })
                    }
                  />
                  <span className='lg-num'>{fadeSec} s</span>
                </div>
              </div>

              {/* Source-text mode */}
              <div className='lg-field'>
                <label className='lg-field__label'>
                  {t('home.incoming.advanced.sourceModeLabel')}
                </label>
                <div className='lg-seg'>
                  {SOURCE_MODES.map((m) => {
                    const active = current.show_original_mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type='button'
                        aria-pressed={active}
                        className={`lg-seg__item ${
                          active ? 'lg-seg__item--active' : ''
                        }`}
                        onClick={() =>
                          setPref({
                            show_original_mode: m.id,
                            show_original: m.id !== 'never',
                          })
                        }>
                        {t(`home.incoming.advanced.${m.labelKey}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Team-color toggle */}
              <div
                className='lg-field'
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: 'var(--lg-ink-0)',
                    }}>
                    {t('home.incoming.advanced.teamColorLabel')}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--lg-ink-3)',
                      marginTop: 2,
                    }}>
                    {t('home.incoming.advanced.teamColorHint')}
                  </div>
                </div>
                <button
                  type='button'
                  className={`lg-toggle ${current.team_color ? 'lg-toggle--on' : ''}`}
                  onClick={() => setPref({ team_color: !current.team_color })}
                  aria-pressed={current.team_color}>
                  <span className='lg-toggle__thumb' />
                </button>
              </div>

              {/* Hotkeys (kept from previous design — still required) */}
              <div className='lg-field'>
                <label className='lg-field__label'>
                  {t('home.incoming.advanced.hotkeysTitle')}
                </label>
                <HotkeyRebindRow
                  label={t('home.incoming.advanced.hotkeyToggle')}
                  description={t('home.incoming.advanced.hotkeyToggleHint')}
                  hotkey={settings?.incoming_toggle_hotkey}
                  fallbackLabel={defaultIncomingToggleHotkeyLabel()}
                  onSave={async (keys) => {
                    const latest = await updateIncomingToggleHotkey(keys);
                    onChange?.(latest);
                  }}
                />
                <HotkeyRebindRow
                  label={t('home.incoming.advanced.hotkeyLock')}
                  description={t('home.incoming.advanced.hotkeyLockHint')}
                  hotkey={settings?.incoming_click_through_hotkey}
                  fallbackLabel={defaultIncomingClickThroughHotkeyLabel()}
                  onSave={async (keys) => {
                    const latest = await updateIncomingClickThroughHotkey(keys);
                    onChange?.(latest);
                  }}
                />
              </div>
            </div>

            <div className='lg-modal__foot'>
              <button
                type='button'
                className='lg-btn'
                onClick={handleResetDefaults}>
                {t('home.incoming.advanced.resetDefaults')}
              </button>
              <button
                type='button'
                className='lg-btn lg-btn--primary'
                onClick={onClose}>
                <ICheck /> {t('home.incoming.advanced.done')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// HotkeyRebindRow — local component, recording loop mirrors HotkeyCard
// =============================================================================

function formatPreview(codes) {
  return codes
    .map((code) =>
      isModifierKeyCode(code)
        ? formatModifierLabel(normalizeModifier(code))
        : formatMainKeyLabel(code),
    )
    .join(' + ');
}

function HotkeyRebindRow({ label, description, hotkey, fallbackLabel, onSave }) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [capturedCodes, setCapturedCodes] = useState([]);
  const [saving, setSaving] = useState(false);
  const codesRef = useRef([]);
  const committingRef = useRef(false);

  const stopRecording = useCallback(() => {
    codesRef.current = [];
    setCapturedCodes([]);
    setRecording(false);
    committingRef.current = false;
  }, []);

  const commit = useCallback(async () => {
    if (committingRef.current) return;
    committingRef.current = true;
    const keys = [...codesRef.current];

    if (keys.length === 0) {
      stopRecording();
      return;
    }

    setSaving(true);
    try {
      if (hasTauriRuntime()) {
        await onSave(keys);
      } else {
        buildHotkeyFromKeyCodes(keys);
      }
      showSuccess(t('home.incoming.advanced.hotkeySaved'));
    } catch (error) {
      showError(
        t('home.incoming.advanced.hotkeySaveFailed', {
          error: toErrorMessage(error),
        }),
      );
    } finally {
      setSaving(false);
      stopRecording();
    }
  }, [onSave, stopRecording, t]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopRecording();
        return;
      }
      const code = event.code;
      if (!code || codesRef.current.includes(code)) return;
      codesRef.current = [...codesRef.current, code];
      setCapturedCodes(codesRef.current);
    },
    [recording, stopRecording],
  );

  const handleKeyUp = useCallback(
    (event) => {
      if (!recording) return;
      const hasMain = codesRef.current.some((c) => !isModifierKeyCode(c));
      if (!hasMain) return;
      event.preventDefault();
      event.stopPropagation();
      void commit();
    },
    [recording, commit],
  );

  useEffect(() => {
    if (!recording) return undefined;
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [recording, handleKeyDown, handleKeyUp]);

  const beginRecording = () => {
    if (recording) {
      stopRecording();
      return;
    }
    setRecording(true);
    codesRef.current = [];
    setCapturedCodes([]);
  };

  const currentLabel = useMemo(() => {
    if (recording && capturedCodes.length === 0) {
      return t('home.incoming.advanced.hotkeyRecording');
    }
    if (recording) {
      return formatPreview(capturedCodes);
    }
    return hotkey?.shortcut || fallbackLabel;
  }, [recording, capturedCodes, hotkey?.shortcut, fallbackLabel, t]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderRadius: 9,
        background: 'var(--lg-surf-2)',
        border: '1px solid var(--lg-line-1)',
        gap: 10,
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--lg-ink-0)',
          }}>
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--lg-ink-3)',
              marginTop: 2,
            }}>
            {description}
          </div>
        )}
      </div>
      <button
        type='button'
        onClick={beginRecording}
        disabled={saving}
        aria-pressed={recording}
        className='lg-btn lg-btn--sm'
        style={{
          borderColor: recording ? '#7085fa' : undefined,
          background: recording ? 'rgba(112,133,250,.10)' : undefined,
        }}>
        {saving ? (
          <Spinner style={{ width: 12, height: 12 }} />
        ) : (
          <KeyboardAlt style={{ width: 12, height: 12 }} />
        )}
        <span>{currentLabel}</span>
      </button>
    </div>
  );
}
