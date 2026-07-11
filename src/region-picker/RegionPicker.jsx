import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ITarget, ICheck } from '../icons';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Full-screen drag-to-select region picker, modeled after macOS's built-in
 * Cmd+Shift+5 screenshot UI. The host window is transparent + dimmed +
 * always-on-top; the user drags out a rectangle anywhere on screen and
 * confirms with mouseup or the on-screen Save button.
 *
 * The picker doesn't know its own context (which display, which game
 * scene). The caller emits a `region-picker:open` event with those
 * details before showing the window; we listen for it and use the
 * payload when we save.
 *
 * Coordinate space: we save the rect in CSS pixels of the picker
 * window. The host window is sized + positioned to exactly cover one
 * display, so picker coords == display-local pixel coords for the
 * pipeline's CGDisplayCreateImageForRect call later.
 *
 * Visual: v0.8 — `.lg-region-*` design system from the foundation.
 */

const MIN_PICK_SIZE = 24;

export default function RegionPicker() {
  const { t } = useI18n();
  const [ctx, setCtx] = useState(null); // { display_id, scene, display_width, display_height }
  const [drag, setDrag] = useState(null); // { startX, startY, currX, currY, dragging }
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const rootRef = useRef(null);

  // ----- Listen for the open event -----
  useEffect(() => {
    let unlisten = null;
    let cancelled = false;
    (async () => {
      try {
        unlisten = await listen('region-picker:open', (event) => {
          if (cancelled) return;
          const payload = event.payload || {};
          setCtx({
            display_id: payload.display_id ?? 0,
            scene: payload.game_scene || 'dota2',
            display_width: payload.display_width || window.innerWidth,
            display_height: payload.display_height || window.innerHeight,
          });
          setDrag(null);
          setError(null);
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('failed to listen for region-picker:open', err);
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unlisten === 'function') unlisten();
    };
  }, []);

  // ----- Cancel via ESC -----
  const handleCancel = useCallback(async () => {
    try {
      await invoke('cancel_region_picker');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('cancel_region_picker failed', err);
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void handleCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCancel]);

  // ----- Drag handlers -----
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setError(null);
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      currX: e.clientX,
      currY: e.clientY,
      dragging: true,
    });
  };

  const handleMouseMove = (e) => {
    if (!drag?.dragging) return;
    setDrag((prev) =>
      prev ? { ...prev, currX: e.clientX, currY: e.clientY } : prev,
    );
  };

  const handleMouseUp = () => {
    if (!drag) return;
    const w = Math.abs(drag.currX - drag.startX);
    const h = Math.abs(drag.currY - drag.startY);
    if (w < MIN_PICK_SIZE || h < MIN_PICK_SIZE) {
      setDrag(null);
      setError(t('regionPicker.tooSmall'));
      return;
    }
    setDrag((prev) => (prev ? { ...prev, dragging: false } : prev));
  };

  const rect = drag
    ? {
        x: Math.min(drag.startX, drag.currX),
        y: Math.min(drag.startY, drag.currY),
        w: Math.abs(drag.currX - drag.startX),
        h: Math.abs(drag.currY - drag.startY),
      }
    : null;

  const handleSave = async () => {
    if (!rect || !ctx || submitting) return;
    setSubmitting(true);
    try {
      await invoke('save_picked_region', {
        gameScene: ctx.scene,
        displayId: ctx.display_id,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.w),
        h: Math.round(rect.h),
      });
    } catch (err) {
      setError(String(err?.message || err));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  const handleReset = () => {
    setDrag(null);
    setError(null);
  };

  const handleUseLast = () => {
    // No-op: backend will reuse last saved region if user cancels.
    // Wired as a UX affordance; clicking it cancels the picker so the
    // previously saved region stays in place.
    void handleCancel();
  };

  const handleCenterPreset = () => {
    if (!ctx) return;
    const W = ctx.display_width || window.innerWidth;
    const H = ctx.display_height || window.innerHeight;
    // Bottom-left chat zone: 30% wide × 22% tall, 3% inset (matches
    // IncomingCalibrationModal's dota2DefaultRegion).
    const w = Math.round(W * 0.3);
    const h = Math.round(H * 0.22);
    const x = Math.round(W * 0.03);
    const y = Math.round(H * 0.75);
    setDrag({
      startX: x,
      startY: y,
      currX: x + w,
      currY: y + h,
      dragging: false,
    });
  };

  // ----- Render -----
  return (
    <div
      ref={rootRef}
      className='lg-region-host'
      style={{ width: '100vw', height: '100vh' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}>
      {/* Dim scrim covers everything; the .lg-region-cut below punches
          a transparent rect via box-shadow inversion. */}
      {!rect && <div className='lg-region-scrim' />}

      {rect && (
        <div
          className='lg-region-cut'
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          <div className='lg-region-grid' />
          {/* 4 corner handles */}
          <span className='lg-region-handle' style={{ left: -6, top: -6 }} />
          <span className='lg-region-handle' style={{ right: -6, top: -6 }} />
          <span className='lg-region-handle' style={{ left: -6, bottom: -6 }} />
          <span className='lg-region-handle' style={{ right: -6, bottom: -6 }} />
          {/* 4 mid-edge handles */}
          <span
            className='lg-region-handle'
            style={{ left: '50%', top: -6, transform: 'translateX(-50%)' }}
          />
          <span
            className='lg-region-handle'
            style={{ left: '50%', bottom: -6, transform: 'translateX(-50%)' }}
          />
          <span
            className='lg-region-handle'
            style={{ top: '50%', left: -6, transform: 'translateY(-50%)' }}
          />
          <span
            className='lg-region-handle'
            style={{ top: '50%', right: -6, transform: 'translateY(-50%)' }}
          />
          {/* Coordinate readout */}
          <div className='lg-region-readout'>
            <span style={{ color: '#61ebff' }}>
              {Math.round(rect.x)}, {Math.round(rect.y)}
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {Math.round(rect.w)} × {Math.round(rect.h)}
            </span>
          </div>
        </div>
      )}

      {/* Top hint banner */}
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 14px',
          borderRadius: 10,
          background: 'rgba(11,20,48,.92)',
          border: '1px solid rgba(97,235,255,.22)',
          color: '#f0f3fa',
          fontSize: 12.5,
          fontWeight: 500,
          boxShadow: '0 12px 30px -10px rgba(0,0,0,.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
        }}>
        <ITarget style={{ width: 14, height: 14, color: '#61ebff' }} />
        <span>{t('regionPicker.instructions')}</span>
        <span
          style={{
            marginLeft: 8,
            padding: '2px 7px',
            borderRadius: 4,
            background: 'rgba(97,235,255,.16)',
            color: '#61ebff',
            fontSize: 11,
            fontFamily: 'var(--lg-mono)',
          }}>
          {t('regionPicker.exit')}
        </span>
      </div>

      {/* Bottom toolbar — sits over the scrim, accepts pointer events. */}
      <div
        className='lg-region-toolbar'
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}>
        <span className='lg-region-toolbar__hint'>
          {ctx?.scene ? (
            <>
              <span
                style={{
                  color: '#61ebff',
                  fontFamily: 'var(--lg-mono)',
                  marginRight: 4,
                }}>
                {ctx.scene}
              </span>
              {ctx.display_width && ctx.display_height
                ? `· ${ctx.display_width}×${ctx.display_height}`
                : null}
            </>
          ) : (
            t('regionPicker.preparing')
          )}
        </span>
        <span className='lg-region-toolbar__sep' />
        <button
          type='button'
          className='lg-btn lg-btn--sm'
          onClick={handleUseLast}>
          {t('regionPicker.usePrevious')}
        </button>
        <button
          type='button'
          className='lg-btn lg-btn--sm'
          onClick={handleCenterPreset}>
          {t('regionPicker.preset')}
        </button>
        {rect && !drag?.dragging && (
          <button
            type='button'
            className='lg-btn lg-btn--sm'
            onClick={handleReset}>
            {t('regionPicker.reselect')}
          </button>
        )}
        <span className='lg-region-toolbar__sep' />
        <button
          type='button'
          className='lg-btn lg-btn--sm lg-btn--primary'
          onClick={handleSave}
          disabled={!rect || drag?.dragging || submitting}>
          <ICheck /> {submitting ? t('regionPicker.saving') : t('regionPicker.confirm')}
        </button>
      </div>

      {error && (
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(231,76,60,.22)',
            color: '#ffb3b3',
            border: '1px solid rgba(231,76,60,.45)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
          }}>
          {error}
        </div>
      )}
    </div>
  );
}
