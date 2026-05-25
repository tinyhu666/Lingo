import { useCallback, useEffect, useReducer, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { IAnchorR, IAnchorL, IAnchorT, IAnchorB } from '../icons';

/**
 * Lingo Incoming overlay — v0.8 side-edge ticker.
 *
 * Anchored to the right edge of the game, semi-transparent dark glass,
 * vertical column with messages streaming from bottom-up (newest at the
 * bottom). Click-through default, ⌥L toggle. Each message auto-fades
 * after `fade_ms`. The chrome of the host window is transparent + always
 * on top + skip-taskbar — see `tauri.conf.json`.
 */

const DEFAULT_PREFS = {
  max_lines: 8,
  fade_ms: 8000,
  font_size: 12.5,
  opacity: 0.78,
  show_original: true,
  click_through: true,
  anchor: 'right',
  team_color: true,
};

const initialState = {
  messages: [],
  prefs: DEFAULT_PREFS,
  paused: false,
  clickThrough: true,
};

/**
 * Map the backend MessageScope (`"team" | "all" | null`) to the ticker
 * design's ally/enemy palette. `team` reads as ally (friendly chat),
 * `all` reads as enemy (cross-team broadcast). Unknown defaults to ally.
 */
const scopeTeam = (scope) => {
  switch ((scope || '').toLowerCase()) {
    case 'team':
      return 'ally';
    case 'all':
      return 'enemy';
    default:
      return 'ally';
  }
};

const teamAbbr = (scope) => {
  switch ((scope || '').toLowerCase()) {
    case 'team':
      return 'TEAM';
    case 'all':
      return 'ALL';
    default:
      return 'CHAT';
  }
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'push': {
      const next = [...state.messages, action.message].slice(-state.prefs.max_lines);
      return { ...state, messages: next };
    }
    case 'fade': {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, fading: true } : m,
        ),
      };
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
    case 'pause': {
      return { ...state, paused: action.paused };
    }
    case 'click_through': {
      return { ...state, clickThrough: action.value };
    }
    default:
      return state;
  }
};

export default function Overlay() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const fadeTimersRef = useRef(new Map()); // id -> { fade, expire }

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
            timestamp_ms:
              typeof payload.timestamp_ms === 'number' ? payload.timestamp_ms : Date.now(),
            demo: Boolean(payload.demo),
            fading: false,
          };
          dispatch({ type: 'push', message });
        });

        unlistenPrefs = await listen('incoming:prefs', (event) => {
          if (cancelled) return;
          const next = event.payload || {};
          dispatch({ type: 'set_prefs', prefs: next });
          if (typeof next.click_through === 'boolean') {
            dispatch({ type: 'click_through', value: next.click_through });
          }
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

  // ---- Apply click-through to the host window -----------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const win = getCurrentWindow();
        if (typeof win.setIgnoreCursorEvents === 'function') {
          await win.setIgnoreCursorEvents(Boolean(state.clickThrough));
        }
        if (!cancelled) {
          invoke('set_incoming_overlay_click_through', {
            clickThrough: Boolean(state.clickThrough),
          }).catch(() => {});
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('failed to apply click-through', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.clickThrough]);

  // ---- Schedule fade + expiry per message ---------------------------------
  useEffect(() => {
    const timers = fadeTimersRef.current;
    const fadeMs = Math.max(1000, Number(state.prefs.fade_ms) || 8000);
    // Fade-out CSS animation runs ~1s, so start it slightly before expiry.
    const fadeStart = Math.max(0, fadeMs - 1000);

    for (const msg of state.messages) {
      if (!timers.has(msg.id)) {
        const fadeTimer = window.setTimeout(() => {
          dispatch({ type: 'fade', id: msg.id });
        }, fadeStart);
        const expireTimer = window.setTimeout(() => {
          dispatch({ type: 'expire', id: msg.id });
          timers.delete(msg.id);
        }, fadeMs);
        timers.set(msg.id, { fadeTimer, expireTimer });
      }
    }

    const visible = new Set(state.messages.map((m) => m.id));
    for (const [id, t] of timers.entries()) {
      if (!visible.has(id)) {
        window.clearTimeout(t.fadeTimer);
        window.clearTimeout(t.expireTimer);
        timers.delete(id);
      }
    }
  }, [state.messages, state.prefs.fade_ms]);

  useEffect(() => {
    return () => {
      for (const t of fadeTimersRef.current.values()) {
        window.clearTimeout(t.fadeTimer);
        window.clearTimeout(t.expireTimer);
      }
      fadeTimersRef.current.clear();
    };
  }, []);

  // ---- ⌥L (Alt+L) local toggle while overlay has focus --------------------
  // Global hotkey rebinding lives on the main window via
  // `set_incoming_overlay_click_through` / shortcut.rs. This is a local
  // fallback so the visible handle is also reachable from the overlay.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        dispatch({ type: 'click_through', value: !state.clickThrough });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.clickThrough]);

  const handleRestoreClick = useCallback(() => {
    dispatch({ type: 'click_through', value: false });
  }, []);

  const anchor = state.prefs.anchor || 'right';
  const AnchorIcon =
    anchor === 'left'
      ? IAnchorL
      : anchor === 'top'
        ? IAnchorT
        : anchor === 'bottom'
          ? IAnchorB
          : IAnchorR;

  return (
    <div
      className='lg-ticker'
      style={{
        width: '100%',
        height: '100%',
        opacity: state.prefs.opacity ?? 0.78,
      }}>
      {/* Chrome */}
      <div className='lg-ticker__chrome'>
        <span className='lg-ticker__live' />
        <span>Lingo · Live</span>
        {state.paused && (
          <span style={{ marginLeft: 6, color: '#ffb347' }}>· paused</span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'rgba(240,243,250,.5)',
          }}>
          <AnchorIcon style={{ width: 11, height: 11 }} />
        </span>
      </div>

      {/* Message list — flex column, justify-flex-end so newest sits at the
          bottom and old messages scroll up. */}
      <div
        className='lg-ticker__list'
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          overflow: 'hidden',
          minHeight: 0,
        }}>
        {state.messages.length === 0 && (
          <div
            style={{
              margin: 'auto',
              color: 'rgba(240,243,250,.4)',
              fontSize: 11.5,
              padding: 12,
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
            等待聊天 · Waiting for chat…
          </div>
        )}
        {state.messages.map((msg, idx) => {
          const team = state.prefs.team_color === false ? 'ally' : scopeTeam(msg.scope);
          const abbr = msg.sender || teamAbbr(msg.scope);
          const isNew = idx === state.messages.length - 1;
          return (
            <div
              key={msg.id}
              className={`lg-ticker__msg lg-ticker__msg--${team} ${
                isNew ? 'lg-ticker__msg--new' : ''
              } ${msg.fading ? 'lg-ticker__fade' : ''}`}
              style={{
                fontSize: `${state.prefs.font_size ?? 12.5}px`,
              }}>
              <div className='lg-ticker__author'>
                <span className='lg-ticker__author-team'>{abbr}</span>
                {state.prefs.show_original !== false && msg.source_text && (
                  <span className='lg-ticker__src'>{msg.source_text}</span>
                )}
              </div>
              <div className='lg-ticker__trg'>{msg.translated_text}</div>
            </div>
          );
        })}
      </div>

      {/* Click-through handle — only visible when click-through is active.
          The whole bar accepts clicks (we must temporarily allow cursor
          events; the bar itself sits inside the overlay so the user
          aims at this strip). */}
      {state.clickThrough && (
        <button
          type='button'
          className='lg-ticker__handle'
          onClick={handleRestoreClick}
          style={{
            background: 'transparent',
            border: 0,
            color: 'rgba(240,243,250,.4)',
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
          }}>
          <span className='lg-ticker__handle-chip'>⌥ L</span>
          <span>已穿透 · 点击此处恢复</span>
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'rgba(240,243,250,.3)',
              }}
            />
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'rgba(240,243,250,.3)',
              }}
            />
          </span>
        </button>
      )}
    </div>
  );
}
