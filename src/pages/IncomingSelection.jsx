import { useEffect, useMemo, useState } from 'react';
import { invokeCommand } from '../services/tauriRuntime';

const minimumSelectionSize = 8;

const clampRect = (start, current) => ({
  left: Math.min(start.x, current.x),
  top: Math.min(start.y, current.y),
  width: Math.abs(current.x - start.x),
  height: Math.abs(current.y - start.y),
});

const toPhysicalSelection = (rect) => {
  const dpr = window.devicePixelRatio || 1;
  return {
    x: Math.round((window.screenX + rect.left) * dpr),
    y: Math.round((window.screenY + rect.top) * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
  };
};

export default function IncomingSelection() {
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const purpose = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'translate';
    }
    return new URLSearchParams(window.location.search).get('purpose') || 'translate';
  }, []);

  const selectionRect = dragStart && dragCurrent ? clampRect(dragStart, dragCurrent) : null;
  const title =
    purpose === 'calibrate' ? '校准当前游戏聊天区域' : '圈选需要翻译的聊天区域';
  const hint =
    purpose === 'calibrate'
      ? '拖拽框住队友聊天消息区域，松开后会保存为自动模式的本地校准范围。'
      : '拖拽框住本次想识别的聊天消息，松开后立即翻译。按 Esc 可取消。';

  useEffect(() => {
    const onKeyDown = async (event) => {
      if (event.key !== 'Escape' || submitting) {
        return;
      }

      event.preventDefault();
      try {
        await invokeCommand('cancel_incoming_chat_selection');
      } catch (error) {
        console.error('Failed to cancel incoming selection', error);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [submitting]);

  const handlePointerDown = (event) => {
    if (submitting || event.button !== 0) {
      return;
    }

    setErrorMessage('');
    const nextPoint = { x: event.clientX, y: event.clientY };
    setDragStart(nextPoint);
    setDragCurrent(nextPoint);
  };

  const handlePointerMove = (event) => {
    if (!dragStart || submitting) {
      return;
    }

    setDragCurrent({ x: event.clientX, y: event.clientY });
  };

  const handlePointerUp = async (event) => {
    if (!dragStart || submitting) {
      return;
    }

    const finalRect = clampRect(dragStart, { x: event.clientX, y: event.clientY });
    setDragStart(null);
    setDragCurrent(null);

    if (
      finalRect.width < minimumSelectionSize ||
      finalRect.height < minimumSelectionSize
    ) {
      setErrorMessage('框选区域太小，请重新拖拽。');
      return;
    }

    setSubmitting(true);
    try {
      await invokeCommand('submit_incoming_chat_selection', toPhysicalSelection(finalRect));
    } catch (error) {
      console.error('Failed to submit incoming selection', error);
      setErrorMessage(
        error?.message || '提交圈选失败，请重试。',
      );
      setSubmitting(false);
    }
  };

  const handleContextMenu = async (event) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    try {
      await invokeCommand('cancel_incoming_chat_selection');
    } catch (error) {
      console.error('Failed to cancel incoming selection', error);
    }
  };

  return (
    <div
      className='relative h-full w-full cursor-crosshair overflow-hidden bg-[rgba(4,8,18,0.24)] text-white'
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}>
      <div className='pointer-events-none absolute left-6 top-6 max-w-[460px] rounded-[24px] border border-white/18 bg-[rgba(5,10,20,0.8)] px-5 py-4 shadow-[0_24px_56px_rgba(0,0,0,0.34)] backdrop-blur-xl'>
        <div className='text-xs font-semibold uppercase tracking-[0.22em] text-white/60'>
          Lingo
        </div>
        <div className='mt-2 text-lg font-semibold'>{title}</div>
        <div className='mt-2 text-sm leading-6 text-white/76'>{hint}</div>
        {errorMessage ? <div className='mt-3 text-sm text-rose-300'>{errorMessage}</div> : null}
        {submitting ? (
          <div className='mt-3 text-sm font-medium text-emerald-300'>处理中...</div>
        ) : null}
      </div>

      {selectionRect ? (
        <div
          className='pointer-events-none absolute border border-[#7dd3fc] bg-[rgba(125,211,252,0.18)] shadow-[0_0_0_1px_rgba(255,255,255,0.18)]'
          style={{
            left: `${selectionRect.left}px`,
            top: `${selectionRect.top}px`,
            width: `${selectionRect.width}px`,
            height: `${selectionRect.height}px`,
          }}
        />
      ) : null}
    </div>
  );
}
