import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
 */

const MIN_PICK_SIZE = 24;

export default function RegionPicker() {
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
      setError('框选区域太小，请按住鼠标拖出更大的矩形');
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

  // ----- Render -----
  return (
    <div
      ref={rootRef}
      className='region-picker'
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}>
      {/* Dim overlay split into 4 rects around the drag, leaving the
          dragged area clear so the user can see what's underneath. */}
      {rect ? (
        <>
          <div
            className='region-picker__dim'
            style={{ top: 0, left: 0, width: '100%', height: rect.y }}
          />
          <div
            className='region-picker__dim'
            style={{
              top: rect.y,
              left: 0,
              width: rect.x,
              height: rect.h,
            }}
          />
          <div
            className='region-picker__dim'
            style={{
              top: rect.y,
              left: rect.x + rect.w,
              right: 0,
              height: rect.h,
            }}
          />
          <div
            className='region-picker__dim'
            style={{
              top: rect.y + rect.h,
              left: 0,
              width: '100%',
              bottom: 0,
            }}
          />
          <div
            className={`region-picker__rect ${
              drag?.dragging ? 'region-picker__rect--dragging' : 'region-picker__rect--committed'
            }`}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
            }}>
            <div className='region-picker__rect-label'>
              {Math.round(rect.w)} × {Math.round(rect.h)}
            </div>
          </div>
        </>
      ) : (
        <div className='region-picker__dim region-picker__dim--full' />
      )}

      {/* Toolbar */}
      <div className='region-picker__toolbar' onMouseDown={(e) => e.stopPropagation()}>
        <div className='region-picker__hint'>
          {!rect && '按住鼠标左键拖出聊天区域 · Drag to select chat region · ESC 取消'}
          {rect && drag?.dragging && '继续拖动… · Release to confirm'}
          {rect && !drag?.dragging && (
            <span>
              已框选 <strong>{Math.round(rect.w)}×{Math.round(rect.h)}</strong> · 起点{' '}
              <strong>{Math.round(rect.x)}, {Math.round(rect.y)}</strong>
            </span>
          )}
        </div>
        {error && <div className='region-picker__error'>{error}</div>}
        <div className='region-picker__buttons'>
          <button type='button' className='region-picker__btn' onClick={handleCancel}>
            取消 · Cancel (ESC)
          </button>
          {rect && !drag?.dragging && (
            <button type='button' className='region-picker__btn' onClick={handleReset}>
              重新选择 · Reset
            </button>
          )}
          {rect && !drag?.dragging && (
            <button
              type='button'
              className='region-picker__btn region-picker__btn--primary'
              onClick={handleSave}
              disabled={submitting}>
              {submitting ? '保存中…' : '保存 · Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
