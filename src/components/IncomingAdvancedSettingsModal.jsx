import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XClose, KeyboardAlt, Spinner } from '../icons';
import {
  buildHotkeyFromKeyCodes,
  defaultTranslatorHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  isModifierKeyCode,
  normalizeModifier,
} from '../constants/hotkeys';
import {
  setIncomingCaptureRate,
  updateIncomingClickThroughHotkey,
  updateIncomingOverlayPreferences,
  updateIncomingToggleHotkey,
} from '../services/incomingService';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Power-user settings dialog reachable via the "高级设置" / "Advanced"
 * button on `IncomingStatusCard`. Three sections — hotkey rebind,
 * overlay appearance, capture rate — sharing one save model where each
 * change persists immediately and pushes a live update to the overlay
 * via the `incoming:prefs` Tauri event.
 *
 * The overlay listens for that event and applies font / opacity /
 * max-lines / fade changes without a restart, so the user gets
 * real-time visual feedback while dragging sliders.
 */

const FADE_OPTIONS = [
  { value: 3000, key: 'fade3s' },
  { value: 5000, key: 'fade5s' },
  { value: 8000, key: 'fade8s' },
  { value: 12000, key: 'fade12s' },
  { value: 20000, key: 'fade20s' },
];

const CAPTURE_RATE_OPTIONS = [
  { value: 0.75, key: 'capture0_75' },
  { value: 1.0, key: 'capture1' },
  { value: 1.5, key: 'capture1_5' },
  { value: 2.0, key: 'capture2' },
  { value: 3.0, key: 'capture3' },
];

export default function IncomingAdvancedSettingsModal({ open, onClose, settings, onChange }) {
  const { t } = useI18n();
  const overlayPrefs = settings?.incoming_overlay || {};
  const captureRate = settings?.incoming_capture_rate_hz || 1.5;

  const persist = useCallback(
    async (next) => {
      try {
        const latest = await updateIncomingOverlayPreferences(next);
        if (latest && typeof latest === 'object') {
          onChange?.(latest);
        }
      } catch (error) {
        showError(t('home.incoming.advanced.saveFailed', { error: toErrorMessage(error) }));
      }
    },
    [onChange, t],
  );

  const setPref = (patch) => persist({ ...overlayPrefs, ...patch });

  const handleCaptureRate = async (value) => {
    try {
      const latest = await setIncomingCaptureRate(Number(value));
      if (latest && typeof latest === 'object') {
        onChange?.(latest);
      }
    } catch (error) {
      showError(t('home.incoming.advanced.saveFailed', { error: toErrorMessage(error) }));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='lingo-calibration-backdrop'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}>
          <motion.div
            className='lingo-calibration-dialog lingo-advanced-dialog'
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}>
            <header className='lingo-calibration-dialog__header'>
              <div>
                <div className='tool-pill'>{t('home.incoming.advanced.titleBadge')}</div>
                <h2 className='tool-page-title mt-2'>{t('home.incoming.advanced.title')}</h2>
              </div>
              <button
                type='button'
                className='lingo-calibration-dialog__close'
                onClick={onClose}
                aria-label={t('home.incoming.advanced.close')}>
                <XClose className='h-4 w-4' />
              </button>
            </header>

            <p className='tool-body lingo-calibration-dialog__intro'>
              {t('home.incoming.advanced.intro')}
            </p>

            <section className='lingo-advanced-section'>
              <h3 className='lingo-advanced-section__title'>
                {t('home.incoming.advanced.hotkeysTitle')}
              </h3>

              <HotkeyRebindRow
                label={t('home.incoming.advanced.hotkeyToggle')}
                description={t('home.incoming.advanced.hotkeyToggleHint')}
                hotkey={settings?.incoming_toggle_hotkey}
                onSave={async (keys) => {
                  const latest = await updateIncomingToggleHotkey(keys);
                  onChange?.(latest);
                }}
              />
              <HotkeyRebindRow
                label={t('home.incoming.advanced.hotkeyLock')}
                description={t('home.incoming.advanced.hotkeyLockHint')}
                hotkey={settings?.incoming_click_through_hotkey}
                onSave={async (keys) => {
                  const latest = await updateIncomingClickThroughHotkey(keys);
                  onChange?.(latest);
                }}
              />
            </section>

            <section className='lingo-advanced-section'>
              <h3 className='lingo-advanced-section__title'>
                {t('home.incoming.advanced.overlayTitle')}
              </h3>

              <div className='lingo-advanced-field'>
                <div className='lingo-advanced-field__head'>
                  <span className='tool-caption'>{t('home.incoming.advanced.opacity')}</span>
                  <span className='lingo-advanced-field__value'>
                    {Math.round((overlayPrefs.opacity ?? 0.85) * 100)}%
                  </span>
                </div>
                <input
                  type='range'
                  min={40}
                  max={100}
                  step={5}
                  value={Math.round((overlayPrefs.opacity ?? 0.85) * 100)}
                  onChange={(e) => setPref({ opacity: Number(e.target.value) / 100 })}
                />
              </div>

              <div className='lingo-advanced-field'>
                <div className='lingo-advanced-field__head'>
                  <span className='tool-caption'>{t('home.incoming.advanced.fontSize')}</span>
                  <span className='lingo-advanced-field__value'>
                    {overlayPrefs.font_size ?? 14}px
                  </span>
                </div>
                <input
                  type='range'
                  min={11}
                  max={22}
                  step={1}
                  value={overlayPrefs.font_size ?? 14}
                  onChange={(e) => setPref({ font_size: Number(e.target.value) })}
                />
              </div>

              <div className='lingo-advanced-field'>
                <div className='lingo-advanced-field__head'>
                  <span className='tool-caption'>{t('home.incoming.advanced.maxLines')}</span>
                  <span className='lingo-advanced-field__value'>
                    {overlayPrefs.max_lines ?? 6}
                  </span>
                </div>
                <input
                  type='range'
                  min={2}
                  max={12}
                  step={1}
                  value={overlayPrefs.max_lines ?? 6}
                  onChange={(e) => setPref({ max_lines: Number(e.target.value) })}
                />
              </div>

              <div className='lingo-advanced-field'>
                <span className='tool-caption'>{t('home.incoming.advanced.fadeMs')}</span>
                <div className='lingo-advanced-field__chips'>
                  {FADE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type='button'
                      className={`lingo-advanced-field__chip ${
                        Math.abs((overlayPrefs.fade_ms ?? 8000) - opt.value) < 50
                          ? 'lingo-advanced-field__chip--active'
                          : ''
                      }`}
                      onClick={() => setPref({ fade_ms: opt.value })}>
                      {t(`home.incoming.advanced.${opt.key}`)}
                    </button>
                  ))}
                </div>
              </div>

              <label className='lingo-advanced-field lingo-advanced-field--row'>
                <input
                  type='checkbox'
                  checked={overlayPrefs.show_original !== false}
                  onChange={(e) => setPref({ show_original: e.target.checked })}
                />
                <span>
                  <span className='lingo-advanced-field__label'>
                    {t('home.incoming.advanced.showOriginal')}
                  </span>
                  <span className='lingo-advanced-field__hint'>
                    {t('home.incoming.advanced.showOriginalHint')}
                  </span>
                </span>
              </label>
            </section>

            <section className='lingo-advanced-section'>
              <h3 className='lingo-advanced-section__title'>
                {t('home.incoming.advanced.captureTitle')}
              </h3>
              <p className='lingo-advanced-field__hint'>
                {t('home.incoming.advanced.captureHint')}
              </p>
              <div className='lingo-advanced-field__chips'>
                {CAPTURE_RATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type='button'
                    className={`lingo-advanced-field__chip ${
                      Math.abs(captureRate - opt.value) < 0.05
                        ? 'lingo-advanced-field__chip--active'
                        : ''
                    }`}
                    onClick={() => handleCaptureRate(opt.value)}>
                    {t(`home.incoming.advanced.${opt.key}`)}
                  </button>
                ))}
              </div>
            </section>

            <footer className='lingo-calibration-dialog__footer'>
              <p className='lingo-advanced-footer__hint'>
                {t('home.incoming.advanced.persistedHint')}
              </p>
              <div className='lingo-calibration-dialog__footer-right'>
                <button type='button' className='tool-btn-primary' onClick={onClose}>
                  {t('home.incoming.advanced.done')}
                </button>
              </div>
            </footer>
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

function HotkeyRebindRow({ label, description, hotkey, onSave }) {
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
        // Preview environment: still surface a validation error if the
        // combo is invalid by building the same shape the backend would.
        buildHotkeyFromKeyCodes(keys);
      }
      showSuccess(t('home.incoming.advanced.hotkeySaved'));
    } catch (error) {
      showError(t('home.incoming.advanced.hotkeySaveFailed', { error: toErrorMessage(error) }));
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
    return hotkey?.shortcut || defaultTranslatorHotkeyLabel();
  }, [recording, capturedCodes, hotkey?.shortcut, t]);

  return (
    <div className='lingo-advanced-hotkey'>
      <div className='lingo-advanced-hotkey__copy'>
        <div className='lingo-advanced-hotkey__label'>{label}</div>
        {description && (
          <div className='lingo-advanced-hotkey__hint'>{description}</div>
        )}
      </div>
      <button
        type='button'
        onClick={beginRecording}
        disabled={saving}
        aria-pressed={recording}
        className={`lingo-advanced-hotkey__btn ${
          recording ? 'lingo-advanced-hotkey__btn--recording' : ''
        }`}>
        {saving ? (
          <Spinner className='lingo-advanced-hotkey__spinner' />
        ) : (
          <KeyboardAlt className='lingo-advanced-hotkey__icon' />
        )}
        <span className='lingo-advanced-hotkey__current'>{currentLabel}</span>
      </button>
    </div>
  );
}
