import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { XClose } from '../icons';
import { useI18n } from '../i18n/I18nProvider';
import {
  listDisplays,
  saveIncomingChatRegion,
  clearIncomingChatRegion,
} from '../services/incomingService';
import { hasTauriRuntime } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

/**
 * Region calibration modal — v0.7.0-rc.2 redesign.
 *
 * The rc.1 version asked users to pick from three hardcoded resolution
 * presets (1080p/1440p/4K) and edit four numeric inputs. On HiDPI Macs
 * the displays report logical sizes like 1470×956 and none of the
 * presets fit. Painful.
 *
 * This version:
 * 1. **Drag-to-select fullscreen picker.** Primary CTA. Clicking it
 *    opens a transparent always-on-top window that covers the chosen
 *    display; the user drags a rectangle on the actual screen with a
 *    Cmd+Shift+5-style dim. Mouseup -> Save in the picker -> region
 *    persists -> picker hides -> this modal updates.
 * 2. **Auto-scaled DotA default** that's computed from the actual
 *    detected display dimensions, not hardcoded pixel coords. Works on
 *    any resolution, including the scaled HiDPI configs Apple ships by
 *    default.
 * 3. **Manual x/y/w/h inputs** retained as a power-user fallback for
 *    folks who already know the exact coords.
 */

const DEFAULT_DISPLAY = {
  id: 0,
  name: 'Primary Display',
  width: 1920,
  height: 1080,
  origin_x: 0,
  origin_y: 0,
  scale_factor: 1.0,
  is_primary: true,
};

/**
 * Compute a sensible default chat region for DotA 2 as a function of
 * the display size, in the same units the rest of the pipeline uses
 * (logical points on macOS, pixels on Windows).
 *
 * Anchors: bottom-left of the screen, ~30% wide, ~22% tall, with a 3%
 * inset from the screen edges. Tuned against DotA 2's default UI scale
 * across 1080p / 1440p / 4K and the M1 Air's 1470×956 logical mode.
 */
function dota2DefaultRegion(displayW, displayH) {
  const w = Math.round(displayW * 0.3);
  const h = Math.round(displayH * 0.22);
  const x = Math.round(displayW * 0.03);
  const y = Math.round(displayH * 0.75);
  return { x, y, w, h };
}

export default function IncomingCalibrationModal({
  open,
  onClose,
  gameScene,
  currentRegion,
  onSaved,
}) {
  const { t } = useI18n();

  const [displays, setDisplays] = useState([DEFAULT_DISPLAY]);
  const [displayId, setDisplayId] = useState(DEFAULT_DISPLAY.id);
  const [region, setRegion] = useState(dota2DefaultRegion(
    DEFAULT_DISPLAY.width,
    DEFAULT_DISPLAY.height,
  ));
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ---- Load displays + seed initial region ----
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const list = await listDisplays();
      if (cancelled) return;
      const next = list.length > 0 ? list : [DEFAULT_DISPLAY];
      setDisplays(next);
      const initialDisplayId =
        currentRegion?.display_id != null && next.some((d) => d.id === currentRegion.display_id)
          ? currentRegion.display_id
          : next[0].id;
      setDisplayId(initialDisplayId);
      const initialDisplay = next.find((d) => d.id === initialDisplayId) || next[0];
      if (currentRegion?.bounds) {
        setRegion({
          x: currentRegion.bounds.x ?? 0,
          y: currentRegion.bounds.y ?? 0,
          w: currentRegion.bounds.w ?? 0,
          h: currentRegion.bounds.h ?? 0,
        });
      } else {
        setRegion(dota2DefaultRegion(initialDisplay.width, initialDisplay.height));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentRegion]);

  // ---- Subscribe to region-picker events ----
  useEffect(() => {
    if (!open) return;
    let unlistenSaved = null;
    let unlistenCancelled = null;
    (async () => {
      try {
        unlistenSaved = await listen('region-picker:saved', (event) => {
          const payload = event.payload || {};
          if (payload.region?.bounds) {
            setRegion({ ...payload.region.bounds });
          }
          if (payload.region?.display_id != null) {
            setDisplayId(payload.region.display_id);
          }
          setPickerOpen(false);
          showSuccess(t('home.incoming.calibration.saved'));
          onSaved?.();
        });
        unlistenCancelled = await listen('region-picker:cancelled', () => {
          setPickerOpen(false);
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('failed to listen for picker events', err);
      }
    })();
    return () => {
      if (typeof unlistenSaved === 'function') unlistenSaved();
      if (typeof unlistenCancelled === 'function') unlistenCancelled();
    };
  }, [open, onSaved, t]);

  const activeDisplay = useMemo(
    () => displays.find((d) => d.id === displayId) || displays[0] || DEFAULT_DISPLAY,
    [displays, displayId],
  );

  const updateField = (field) => (event) => {
    const raw = event.target.value;
    const parsed = Number.parseInt(raw, 10);
    setRegion((prev) => ({ ...prev, [field]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const isValid =
    region.w > 0 &&
    region.h > 0 &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.x + region.w <= activeDisplay.width &&
    region.y + region.h <= activeDisplay.height;

  const handleApplyAutoDefault = () => {
    setRegion(dota2DefaultRegion(activeDisplay.width, activeDisplay.height));
  };

  const handleOpenPicker = async () => {
    if (!hasTauriRuntime()) {
      showError(t('home.incoming.calibration.pickerDesktopOnly'));
      return;
    }
    setPickerOpen(true);
    try {
      await invoke('open_region_picker', {
        displayId: activeDisplay.id,
        gameScene,
      });
    } catch (error) {
      setPickerOpen(false);
      showError(t('home.incoming.calibration.pickerFailed', { error: toErrorMessage(error) }));
    }
  };

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      await clearIncomingChatRegion(gameScene);
      showSuccess(t('home.incoming.calibration.cleared'));
      onSaved?.();
      onClose?.();
    } catch (error) {
      showError(t('home.incoming.calibration.saveFailed', { error: toErrorMessage(error) }));
    } finally {
      setSaving(false);
    }
  }, [gameScene, onClose, onSaved, t]);

  const handleSave = useCallback(async () => {
    if (!isValid) {
      showError(t('home.incoming.calibration.invalidRegion'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        display_id: activeDisplay.id,
        bounds: { x: region.x, y: region.y, w: region.w, h: region.h },
        languages: [],
      };
      await saveIncomingChatRegion(gameScene, payload);
      showSuccess(t('home.incoming.calibration.saved'));
      onSaved?.();
      onClose?.();
    } catch (error) {
      showError(t('home.incoming.calibration.saveFailed', { error: toErrorMessage(error) }));
    } finally {
      setSaving(false);
    }
  }, [activeDisplay.id, gameScene, isValid, onClose, onSaved, region, t]);

  // ---- Preview SVG ----
  const previewW = 360;
  const scaleX = previewW / activeDisplay.width;
  const previewH = Math.max(160, Math.round(activeDisplay.height * scaleX));
  const rectX = region.x * scaleX;
  const rectY = region.y * scaleX;
  const rectW = region.w * scaleX;
  const rectH = region.h * scaleX;
  const rectFits = isValid;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='lingo-calibration-backdrop'
          initial={{ opacity: 0 }}
          animate={{ opacity: pickerOpen ? 0 : 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}>
          <motion.div
            className='lingo-calibration-dialog'
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}>
            <header className='lingo-calibration-dialog__header'>
              <div>
                <div className='tool-pill'>{t('home.incoming.calibration.titleBadge')}</div>
                <h2 className='tool-page-title mt-2'>
                  {t('home.incoming.calibration.title', { scene: gameScene })}
                </h2>
              </div>
              <button
                type='button'
                className='lingo-calibration-dialog__close'
                onClick={onClose}
                aria-label={t('home.incoming.calibration.close')}>
                <XClose className='h-4 w-4' />
              </button>
            </header>

            <p className='tool-body lingo-calibration-dialog__intro'>
              {t('home.incoming.calibration.intro')}
            </p>

            {/* ---------------- Primary CTA: drag-to-pick ---------------- */}
            <div className='lingo-calibration-primary'>
              <button
                type='button'
                className='lingo-calibration-primary__btn'
                onClick={handleOpenPicker}>
                <span className='lingo-calibration-primary__btn-title'>
                  {t('home.incoming.calibration.pickerCta')}
                </span>
                <span className='lingo-calibration-primary__btn-hint'>
                  {t('home.incoming.calibration.pickerHint')}
                </span>
              </button>
            </div>

            <div className='lingo-calibration-divider'>
              <span>{t('home.incoming.calibration.or')}</span>
            </div>

            {/* ---------------- Auto-default + manual coords ------------- */}
            <div className='lingo-calibration-dialog__grid'>
              <div className='lingo-calibration-form'>
                <label className='tool-caption' htmlFor='calib-display'>
                  {t('home.incoming.calibration.display')}
                </label>
                <select
                  id='calib-display'
                  className='tool-input'
                  value={displayId}
                  onChange={(e) => {
                    const nextId = Number(e.target.value);
                    setDisplayId(nextId);
                    const nextDisplay =
                      displays.find((d) => d.id === nextId) || displays[0] || DEFAULT_DISPLAY;
                    setRegion(dota2DefaultRegion(nextDisplay.width, nextDisplay.height));
                  }}>
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.is_primary ? ` · ${t('home.incoming.calibration.primary')}` : ''}
                    </option>
                  ))}
                </select>

                <button
                  type='button'
                  className='lingo-calibration-form__preset-btn lingo-calibration-form__preset-btn--wide'
                  onClick={handleApplyAutoDefault}>
                  {t('home.incoming.calibration.autoDefaultCta', {
                    w: activeDisplay.width,
                    h: activeDisplay.height,
                  })}
                </button>

                <div className='lingo-calibration-form__coords'>
                  {[
                    { key: 'x', label: 'X' },
                    { key: 'y', label: 'Y' },
                    { key: 'w', label: 'W' },
                    { key: 'h', label: 'H' },
                  ].map((field) => (
                    <label key={field.key} className='lingo-calibration-form__coord-field'>
                      <span className='tool-caption'>{field.label}</span>
                      <input
                        type='number'
                        min={0}
                        className='tool-input'
                        value={region[field.key]}
                        onChange={updateField(field.key)}
                      />
                    </label>
                  ))}
                </div>

                <p className='lingo-calibration-form__hint'>
                  {t('home.incoming.calibration.coordsHint')}
                </p>
              </div>

              <div className='lingo-calibration-preview'>
                <span className='tool-caption'>{t('home.incoming.calibration.preview')}</span>
                <svg
                  className='lingo-calibration-preview__svg'
                  viewBox={`0 0 ${previewW} ${previewH}`}
                  width={previewW}
                  height={previewH}>
                  <defs>
                    <pattern id='calib-grid' width='20' height='20' patternUnits='userSpaceOnUse'>
                      <path d='M 20 0 L 0 0 0 20' fill='none' stroke='rgba(255,255,255,0.06)' strokeWidth='1' />
                    </pattern>
                  </defs>
                  <rect x='0' y='0' width={previewW} height={previewH} fill='rgba(20,22,32,0.85)' rx='8' />
                  <rect x='0' y='0' width={previewW} height={previewH} fill='url(#calib-grid)' />
                  {rectFits ? (
                    <rect
                      x={rectX}
                      y={rectY}
                      width={rectW}
                      height={rectH}
                      fill='rgba(95, 182, 255, 0.22)'
                      stroke='#5fb6ff'
                      strokeWidth='1.5'
                      rx='3'
                    />
                  ) : (
                    <rect
                      x={Math.max(0, Math.min(rectX, previewW - 1))}
                      y={Math.max(0, Math.min(rectY, previewH - 1))}
                      width={Math.max(1, Math.min(rectW, previewW))}
                      height={Math.max(1, Math.min(rectH, previewH))}
                      fill='rgba(255, 99, 99, 0.18)'
                      stroke='#ff8080'
                      strokeDasharray='4 3'
                      strokeWidth='1.5'
                      rx='3'
                    />
                  )}
                  <text
                    x={previewW - 8}
                    y={previewH - 10}
                    textAnchor='end'
                    fill='rgba(255,255,255,0.4)'
                    fontSize='11'
                    fontFamily='sans-serif'>
                    {activeDisplay.width}×{activeDisplay.height}
                  </text>
                </svg>
                {!rectFits && (
                  <p className='lingo-calibration-preview__warning'>
                    {t('home.incoming.calibration.outOfBounds')}
                  </p>
                )}
              </div>
            </div>

            <footer className='lingo-calibration-dialog__footer'>
              <button
                type='button'
                className='tool-btn'
                onClick={handleClear}
                disabled={saving || !currentRegion}>
                {t('home.incoming.calibration.clear')}
              </button>
              <div className='lingo-calibration-dialog__footer-right'>
                <button type='button' className='tool-btn' onClick={onClose} disabled={saving}>
                  {t('home.incoming.calibration.cancel')}
                </button>
                <button
                  type='button'
                  className='tool-btn-primary'
                  onClick={handleSave}
                  disabled={saving || !isValid}>
                  {saving ? t('home.incoming.calibration.saving') : t('home.incoming.calibration.save')}
                </button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
