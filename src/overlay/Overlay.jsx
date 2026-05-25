import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Lingo Incoming overlay (variant B — Card Stack).
 *
 * Renders translated chat messages emitted by the back-end pipeline as
 * Tauri `incoming:translation` events. Each message has its own card,
 * coloured by scope (team / all) and fades out after a configurable
 * timeout.
 *
 * The window itself is transparent + always-on-top + skip-taskbar; this
 * component owns only the inner UI.
 */

const DEFAULT_PREFS = {
  max_lines: 6,
  fade_ms: 8000,
  font_size: 14,
  opacity: 0.85,
  show_original: true,
};

const initialState = {
  messages: [],
  prefs: DEFAULT_PREFS,
  showHeader: true,
  paused: false,
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'push': {
      const next = [action.message, ...state.messages].slice(0, state.prefs.max_lines);
      return { ...state, messages: next };
    }
    case 'expire': {
      return { ...state, messages: state.messages.filter((m) => m.id !== action.id) };
    }
    case 'clear': {
      return { ...state, messages: [] };
    }
    case 'set_prefs': {
      return { ...state, prefs: { ...state.prefs, ...action.prefs } };
    }
    case 'toggle_header': {
      return { ...state, showHeader: !state.showHeader };
    }
    case 'pause': {
      return { ...state, paused: action.paused };
    }
    default:
      return state;
  }
};

const scopeClass = (scope) => {
  switch ((scope || '').toLowerCase()) {
    case 'all':
      return 'lingo-overlay__card--all';
    case 'team':
      return 'lingo-overlay__card--team';
    default:
      return 'lingo-overlay__card--neutral';
  }
};

const scopeLabel = (scope) => {
  switch ((scope || '').toLowerCase()) {
    case 'all':
      return 'ALL';
    case 'team':
      return 'TEAM';
    default:
      return '';
  }
};

const formatTime = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) {
    return '';
  }
  const d = new Date(timestampMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function Overlay() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const expireTimersRef = useRef(new Map());

  // ---- Subscribe to incoming events ---------------------------------------
  useEffect(() => {
    let unlistenTranslation = null;
    let unlistenPrefs = null;
    let unlistenClear = null;
    let unlistenPaused = null;
    let cancelled = false;

    (async () => {
      try {
        unlistenTranslation = await listen('incoming:translation', (event) => {
          if (cancelled) return;
          const payload = event.payload || {};
          const message = {
            id: payload.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sender: payload.sender || null,
            scope: payload.scope || null,
            source_text: payload.source_text || payload.text || '',
            translated_text: payload.translated_text || '',
            source_lang: payload.source_lang || null,
            target_lang: payload.target_lang || null,
            timestamp_ms: typeof payload.timestamp_ms === 'number' ? payload.timestamp_ms : Date.now(),
            demo: Boolean(payload.demo),
          };
          dispatch({ type: 'push', message });
        });

        unlistenPrefs = await listen('incoming:prefs', (event) => {
          if (cancelled) return;
          const next = event.payload || {};
          dispatch({ type: 'set_prefs', prefs: next });
        });

        unlistenClear = await listen('incoming:clear', () => {
          if (cancelled) return;
          dispatch({ type: 'clear' });
        });

        unlistenPaused = await listen('incoming:paused', (event) => {
          if (cancelled) return;
          dispatch({ type: 'pause', paused: Boolean(event.payload) });
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('failed to subscribe to overlay events', error);
      }
    })();

    return () => {
      cancelled = true;
      if (typeof unlistenTranslation === 'function') unlistenTranslation();
      if (typeof unlistenPrefs === 'function') unlistenPrefs();
      if (typeof unlistenClear === 'function') unlistenClear();
      if (typeof unlistenPaused === 'function') unlistenPaused();
    };
  }, []);

  // ---- Auto-expire messages -----------------------------------------------
  useEffect(() => {
    const timers = expireTimersRef.current;
    const fadeMs = state.prefs.fade_ms;
    for (const msg of state.messages) {
      if (!timers.has(msg.id)) {
        const t = window.setTimeout(() => {
          dispatch({ type: 'expire', id: msg.id });
          timers.delete(msg.id);
        }, fadeMs);
        timers.set(msg.id, t);
      }
    }
    // Garbage-collect timers for messages no longer in state
    const visibleIds = new Set(state.messages.map((m) => m.id));
    for (const [id, handle] of timers.entries()) {
      if (!visibleIds.has(id)) {
        window.clearTimeout(handle);
        timers.delete(id);
      }
    }
  }, [state.messages, state.prefs.fade_ms]);

  // ---- Cleanup on unmount -------------------------------------------------
  useEffect(() => {
    return () => {
      for (const handle of expireTimersRef.current.values()) {
        window.clearTimeout(handle);
      }
      expireTimersRef.current.clear();
    };
  }, []);

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().hide();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('failed to hide overlay window', error);
    }
  }, []);

  const handleToggleHeader = useCallback(() => {
    dispatch({ type: 'toggle_header' });
  }, []);

  const cardStyle = useMemo(
    () => ({ fontSize: `${state.prefs.font_size}px` }),
    [state.prefs.font_size],
  );

  const panelStyle = useMemo(
    () => ({ opacity: state.prefs.opacity }),
    [state.prefs.opacity],
  );

  return (
    <div className='lingo-overlay' style={panelStyle}>
      {state.showHeader && (
        <header className='lingo-overlay__header' data-tauri-drag-region>
          <div className='lingo-overlay__header-left' data-tauri-drag-region>
            <span className='lingo-overlay__brand'>Lingo</span>
            <span className='lingo-overlay__brand-tag'>incoming</span>
            {state.paused && <span className='lingo-overlay__paused-tag'>paused</span>}
          </div>
          <div className='lingo-overlay__header-actions'>
            <button
              type='button'
              className='lingo-overlay__icon-btn'
              title='Hide header'
              onClick={handleToggleHeader}>
              –
            </button>
            <button
              type='button'
              className='lingo-overlay__icon-btn lingo-overlay__icon-btn--danger'
              title='Hide overlay'
              onClick={handleClose}>
              ×
            </button>
          </div>
        </header>
      )}

      {!state.showHeader && (
        <button
          type='button'
          className='lingo-overlay__handle'
          data-tauri-drag-region
          onDoubleClick={handleToggleHeader}
          title='Double-click to show header'
        />
      )}

      <main className='lingo-overlay__stack' style={cardStyle}>
        {state.messages.length === 0 && (
          <div className='lingo-overlay__empty'>
            <p>Waiting for chat…</p>
            <p className='lingo-overlay__hint'>
              Capture engine is in development. Demo messages will appear here once enabled.
            </p>
          </div>
        )}

        {state.messages.map((msg) => (
          <article key={msg.id} className={`lingo-overlay__card ${scopeClass(msg.scope)}`}>
            <div className='lingo-overlay__card-header'>
              {msg.sender && <span className='lingo-overlay__sender'>{msg.sender}</span>}
              {scopeLabel(msg.scope) && (
                <span className={`lingo-overlay__scope ${scopeClass(msg.scope)}`}>
                  {scopeLabel(msg.scope)}
                </span>
              )}
              {msg.demo && <span className='lingo-overlay__demo-tag'>DEMO</span>}
              <span className='lingo-overlay__time'>{formatTime(msg.timestamp_ms)}</span>
            </div>
            <div className='lingo-overlay__translated'>{msg.translated_text}</div>
            {state.prefs.show_original && msg.source_text && (
              <div className='lingo-overlay__original'>{msg.source_text}</div>
            )}
          </article>
        ))}
      </main>
    </div>
  );
}
