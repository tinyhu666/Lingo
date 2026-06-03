import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { XClose, ICalibrate, ITarget } from '../icons';
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
 * Region calibration modal — v0.8 .lg-modal repaint.
 *
 * Logic kept intact from the v0.7.0-rc.2 drag-to-pick rewrite:
 *  1. Primary CTA opens the transparent always-on-top region picker
 *     window; mouseup-to-save persists + auto-closes this modal.
 *  2. Auto-default region scaled to the current display dimensions.
 *  3. Manual x/y/w/h numeric inputs retained as a fallback.
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
  const [region, setRegion] = useState(
    dota2DefaultRegion(DEFAULT_DISPLAY.width, DEFAULT_DISPLAY.height),
  );
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
        currentRegion?.display_id != null &&
        next.some((d) => d.id === currentRegion.display_id)
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
    () =>
      displays.find((d) => d.id === displayId) || displays[0] || DEFAULT_DISPLAY,
    [displays, displayId],
  );

  const updateField = (field) => (event) => {
    const raw = event.target.value;
    const parsed = Number.parseInt(raw, 10);
    setRegion((prev) => ({
      ...prev,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    }));
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
      showError(
        t('home.incoming.calibration.pickerFailed', {
          error: toErrorMessage(error),
        }),
      );
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
      showError(
        t('home.incoming.calibration.saveFailed', {
          error: toErrorMessage(error),
        }),
      );
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
      showError(
        t('home.incoming.calibration.saveFailed', {
          error: toErrorMessage(error),
        }),
      );
    } finally {
      setSaving(false);
    }
  }, [activeDisplay.id, gameScene, isValid, onClose, onSaved, region, t]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className='lg-modal-host'
          initial={{ opacity: 0 }}
          animate={{ opacity: pickerOpen ? 0 : 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}>
          <motion.div
            className='lg-modal'
            style={{ width: 520 }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}>
            <div className='lg-modal__head'>
              <div className='lg-card__icon'>
                <ICalibrate />
              </div>
              <div style={{ flex: 1 }}>
                <div className='lg-modal__title'>
                  {t('home.incoming.calibration.title', { scene: gameScene })}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--lg-ink-3)',
                    marginTop: 2,
                  }}>
                  {t('home.incoming.calibration.displayLine', {
                    scene: gameScene,
                    w: activeDisplay.width,
                    h: activeDisplay.height,
                  })}
                </div>
              </div>
              <button
                type='button'
                className='lg-btn lg-btn--ghost lg-btn--sm'
                onClick={onClose}
                aria-label={t('home.incoming.calibration.close')}>
                <XClose style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div className='lg-modal__body'>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--lg-ink-2)',
                  lineHeight: 1.6,
                  margin: 0,
                }}>
                {t('home.incoming.calibration.intro')}
              </p>

              {/* Preview block — small display thumbnail with current
                  region highlighted. */}
              <CalibrationPreview
                activeDisplay={activeDisplay}
                region={region}
                isValid={isValid}
                t={t}
              />

              {/* Display selector */}
              <div className='lg-field'>
                <label className='lg-field__label' htmlFor='calib-display'>
                  {t('home.incoming.calibration.display')}
                </label>
                <select
                  id='calib-display'
                  className='lg-input'
                  value={displayId}
                  onChange={(e) => {
                    const nextId = Number(e.target.value);
                    setDisplayId(nextId);
                    const nextDisplay =
                      displays.find((d) => d.id === nextId) ||
                      displays[0] ||
                      DEFAULT_DISPLAY;
                    setRegion(
                      dota2DefaultRegion(nextDisplay.width, nextDisplay.height),
                    );
                  }}>
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.is_primary
                        ? ` · ${t('home.incoming.calibration.primary')}`
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Resolution adapt segmented */}
              <div className='lg-field'>
                <label className='lg-field__label'>
                  {t('home.incoming.calibration.resolutionAdapt')}
                </label>
                <div className='lg-seg'>
                  <button
                    type='button'
                    className='lg-seg__item lg-seg__item--active'
                    onClick={handleApplyAutoDefault}>
                    {t('home.incoming.calibration.autoDetect')}
                  </button>
                  <button type='button' className='lg-seg__item'>
                    {t('home.incoming.calibration.manualCoords')}
                  </button>
                </div>
              </div>

              {/* Manual coords */}
              <div className='lg-field'>
                <label className='lg-field__label'>
                  {t('home.incoming.calibration.coordsLabel')}
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                  }}>
                  {[
                    { key: 'x', label: 'X' },
                    { key: 'y', label: 'Y' },
                    { key: 'w', label: 'W' },
                    { key: 'h', label: 'H' },
                  ].map((field) => (
                    <label
                      key={field.key}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: 'var(--lg-ink-3)',
                          letterSpacing: '0.04em',
                        }}>
                        {field.label}
                      </span>
                      <input
                        type='number'
                        min={0}
                        className='lg-input'
                        value={region[field.key]}
                        onChange={updateField(field.key)}
                      />
                    </label>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--lg-ink-3)',
                    margin: 0,
                  }}>
                  {t('home.incoming.calibration.coordsHint')}
                </p>
              </div>
            </div>

            <div className='lg-modal__foot'>
              <button
                type='button'
                className='lg-btn'
                onClick={handleClear}
                disabled={saving || !currentRegion}>
                {t('home.incoming.calibration.clear')}
              </button>
              <button
                type='button'
                className='lg-btn'
                onClick={onClose}
                disabled={saving}>
                {t('home.incoming.calibration.cancel')}
              </button>
              <button
                type='button'
                className='lg-btn lg-btn--primary'
                onClick={handleOpenPicker}>
                <ITarget />
                {t('home.incoming.calibration.pickerCta')}
              </button>
              <button
                type='button'
                className='lg-btn lg-btn--primary'
                onClick={handleSave}
                disabled={saving || !isValid}>
                {saving
                  ? t('home.incoming.calibration.saving')
                  : t('home.incoming.calibration.save')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CalibrationPreview({ activeDisplay, region, isValid, t }) {
  const previewW = 140;
  const aspect = activeDisplay.height / activeDisplay.width;
  const previewH = Math.max(60, Math.round(previewW * aspect));
  const scale = previewW / activeDisplay.width;
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--lg-surf-2)',
        border: '1px solid var(--lg-line-1)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
      <div
        style={{
          flex: `0 0 ${previewW}px`,
          height: previewH,
          borderRadius: 8,
          background: '#0b1430',
          position: 'relative',
          overflow: 'hidden',
        }}>
        <div
          style={{
            position: 'absolute',
            left: region.x * scale,
            top: region.y * scale,
            width: Math.max(2, region.w * scale),
            height: Math.max(2, region.h * scale),
            border: `1.5px solid ${isValid ? '#61ebff' : '#ff8080'}`,
            borderRadius: 2,
            boxShadow: isValid ? '0 0 12px rgba(97,235,255,.4)' : 'none',
          }}
        />
      </div>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--lg-ink-2)' }}>
        <div
          style={{ fontWeight: 700, color: 'var(--lg-ink-0)', fontSize: 13 }}>
          {t('home.incoming.calibration.preview')}
        </div>
        <div style={{ fontFamily: 'var(--lg-mono)', marginTop: 4 }}>
          x={region.x} y={region.y}
        </div>
        <div style={{ fontFamily: 'var(--lg-mono)' }}>
          {region.w} × {region.h} px
        </div>
        {!isValid && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: 'var(--lg-danger-ink, #c1442e)',
            }}>
            {t('home.incoming.calibration.outOfBounds')}
          </div>
        )}
      </div>
    </div>
  );
}
