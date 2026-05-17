import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XClose } from '../icons';
import { useI18n } from '../i18n/I18nProvider';
import {
  listDisplays,
  saveIncomingChatRegion,
  clearIncomingChatRegion,
} from '../services/incomingService';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

/**
 * Region calibration modal for the v0.7.0 incoming-chat translation feature.
 *
 * Until the macOS / Windows screen-capture engines land in v0.7.0-rc.2, the
 * modal does not show a live game screenshot. Instead it lets the user dial
 * in chat-region coordinates two ways:
 *
 * 1. Snap to a per-resolution preset (most users on stock 1080p / 1440p
 *    setups should never have to read the numbers).
 * 2. Hand-edit x / y / width / height numeric inputs.
 *
 * A scaled rectangle preview shows where the region sits relative to the
 * full display so users can spot off-screen / sub-pixel mistakes before
 * saving.
 *
 * When the capture engine ships, the SVG background will be replaced with
 * the live frame and we'll add drag-to-resize handles; the save contract
 * stays exactly the same.
 */

const PRESETS = [
  {
    id: 'dota2-1080p',
    label: '1920×1080 · Dota 2',
    displayW: 1920,
    displayH: 1080,
    region: { x: 60, y: 820, w: 580, h: 210 },
  },
  {
    id: 'dota2-1440p',
    label: '2560×1440 · Dota 2',
    displayW: 2560,
    displayH: 1440,
    region: { x: 80, y: 1090, w: 760, h: 280 },
  },
  {
    id: 'dota2-4k',
    label: '3840×2160 · Dota 2',
    displayW: 3840,
    displayH: 2160,
    region: { x: 120, y: 1640, w: 1140, h: 420 },
  },
];

const DEFAULT_DISPLAY = {
  id: 0,
  name: 'Primary Display',
  width: 1920,
  height: 1080,
  scale_factor: 1.0,
  is_primary: true,
};

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
  const [region, setRegion] = useState({ x: 60, y: 820, w: 580, h: 210 });
  const [saving, setSaving] = useState(false);

  // ---- Load displays + seed initial region from current settings ----------
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
      if (currentRegion?.bounds) {
        setRegion({
          x: currentRegion.bounds.x ?? 60,
          y: currentRegion.bounds.y ?? 820,
          w: currentRegion.bounds.w ?? 580,
          h: currentRegion.bounds.h ?? 210,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, currentRegion]);

  const activeDisplay = useMemo(
    () => displays.find((d) => d.id === displayId) || displays[0] || DEFAULT_DISPLAY,
    [displays, displayId],
  );

  const updateField = (field) => (event) => {
    const raw = event.target.value;
    const parsed = Number.parseInt(raw, 10);
    setRegion((prev) => ({ ...prev, [field]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const applyPreset = (preset) => {
    setRegion(preset.region);
  };

  const isValid =
    region.w > 0 &&
    region.h > 0 &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.x + region.w <= activeDisplay.width &&
    region.y + region.h <= activeDisplay.height;

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

  // ---- Preview SVG --------------------------------------------------------
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
          animate={{ opacity: 1 }}
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

            <div className='lingo-calibration-dialog__grid'>
              <div className='lingo-calibration-form'>
                <label className='tool-caption' htmlFor='calib-display'>
                  {t('home.incoming.calibration.display')}
                </label>
                <select
                  id='calib-display'
                  className='tool-input'
                  value={displayId}
                  onChange={(e) => setDisplayId(Number(e.target.value))}>
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.width}×{d.height}
                      {d.is_primary ? ` · ${t('home.incoming.calibration.primary')}` : ''}
                    </option>
                  ))}
                </select>

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

                <div className='lingo-calibration-form__presets'>
                  <span className='tool-caption'>{t('home.incoming.calibration.presets')}</span>
                  <div className='lingo-calibration-form__preset-row'>
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type='button'
                        className='lingo-calibration-form__preset-btn'
                        onClick={() => applyPreset(p)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className='lingo-calibration-form__hint'>
                  {t('home.incoming.calibration.captureSoonNote')}
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
