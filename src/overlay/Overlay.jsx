import { useEffect, useReducer, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalPosition, PhysicalPosition } from '@tauri-apps/api/window';
import { IAnchorR, IAnchorL, IAnchorT, IAnchorB } from '../icons';
import { useI18n } from '../i18n/I18nProvider';
import {
  defaultIncomingClickThroughHotkeyLabel,
  detectMac,
  normalizeModifier,
} from '../constants/hotkeys';
import { calculateOverlayPosition } from './positioning';

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

const OVERLAY_GAP = 12;
const normalizeMaxLines = (value) =>
  Math.min(20, Math.max(1, Math.round(Number(value) || DEFAULT_PREFS.max_lines)));

async function positionOverlayNearGame(gameWindow, anchor = 'right') {
  const win = getCurrentWindow();
  const bounds = gameWindow?.bounds;
  if (
    !bounds ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.w) ||
    !Number.isFinite(bounds.h)
  ) {
    return;
  }

  let display = null;
  try {
    const displays = await invoke('list_displays');
    display = Array.isArray(displays)
      ? displays.find((item) => String(item.id) === String(gameWindow.display_id)) || null
      : null;
  } catch (_) {
    /* positioning still works without display-edge clamping */
  }

  const scaleFactor = Math.max(1, Number(display?.scale_factor) || 1);
  let overlayWidth = 360;
  let overlayHeight = 600;
  try {
    const size = await win.outerSize();
    if (size?.width) overlayWidth = size.width / scaleFactor;
    if (size?.height) overlayHeight = size.height / scaleFactor;
  } catch (_) {
    /* keep defaults */
  }

  const { x, y } = calculateOverlayPosition({
    game: bounds,
    display: display
      ? {
          x: display.origin_x,
          y: display.origin_y,
          w: display.width,
          h: display.height,
        }
      : null,
    overlay: { w: overlayWidth, h: overlayHeight },
    anchor,
    gap: OVERLAY_GAP,
  });

  const position =
    scaleFactor === 1
      ? new PhysicalPosition(Math.round(x), Math.round(y))
      : new LogicalPosition(Math.round(x), Math.round(y));
  await win.setPosition(position);
  if (typeof win.show === 'function') {
    await win.show();
  }
}

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
      const next = [...state.messages, action.message].slice(
        -normalizeMaxLines(state.prefs.max_lines),
      );
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
      const prefs = { ...state.prefs, ...action.prefs };
      prefs.max_lines = normalizeMaxLines(prefs.max_lines);
      return {
        ...state,
        prefs,
        messages: state.messages.slice(-prefs.max_lines),
      };
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
  const { t } = useI18n();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState(defaultIncomingClickThroughHotkeyLabel);
  const [shortcutConfig, setShortcutConfig] = useState(() => ({
    modifiers: detectMac() ? ['Meta', 'Alt'] : ['Control', 'Alt'],
    key: 'KeyL',
  }));
  const fadeTimersRef = useRef(new Map()); // id -> { fade, expire }
  const lastGameWindowRef = useRef(null);

  // Hydrate before applying click-through. Otherwise the initial reducer
  // default would overwrite a persisted `click_through: false` on startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await invoke('get_settings');
        if (cancelled) return;
        const prefs = settings?.incoming_overlay || {};
        dispatch({ type: 'set_prefs', prefs });
        if (typeof prefs.click_through === 'boolean') {
          dispatch({ type: 'click_through', value: prefs.click_through });
        }
        const savedHotkey = settings?.incoming_click_through_hotkey;
        const savedShortcut = savedHotkey?.shortcut;
        if (typeof savedShortcut === 'string' && savedShortcut.trim()) {
          setShortcutLabel(savedShortcut.trim());
        }
        if (Array.isArray(savedHotkey?.modifiers) && savedHotkey?.key) {
          setShortcutConfig(savedHotkey);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('failed to hydrate overlay settings', error);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // ---- v0.9.0 auto-detect: anchor overlay to detected game window --------
  //
  // The pipeline emits `incoming:game_window_changed` whenever the game's
  // bounds move (or a different game becomes foreground). Position the
  // overlay next to the configured anchor edge so the advanced settings
  // preview is not just decorative.
  useEffect(() => {
    let unlistenChanged = null;
    let unlistenClosed = null;
    let unlistenNoGame = null;
    let unlistenMinimised = null;
    let cancelled = false;

    const hide = async () => {
      try {
        lastGameWindowRef.current = null;
        const win = getCurrentWindow();
        if (typeof win.hide === 'function') {
          await win.hide();
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('overlay hide failed', error);
      }
    };

    (async () => {
      try {
        unlistenChanged = await listen('incoming:game_window_changed', (event) => {
          if (cancelled) return;
          lastGameWindowRef.current = event.payload || null;
          positionOverlayNearGame(event.payload, state.prefs.anchor).catch((error) => {
            // eslint-disable-next-line no-console
            console.warn('overlay reposition failed', error);
          });
        });
        unlistenClosed = await listen('incoming:game_closed', () => {
          if (cancelled) return;
          hide().catch(() => {});
        });
        unlistenNoGame = await listen('incoming:no_game_detected', () => {
          if (cancelled) return;
          hide().catch(() => {});
        });
        unlistenMinimised = await listen('incoming:game_minimised', () => {
          if (cancelled) return;
          hide().catch(() => {});
        });

        const status = await invoke('get_incoming_status');
        if (cancelled) return;
        if (status?.active && status?.current_game && !status.current_game.minimised) {
          lastGameWindowRef.current = status.current_game;
          await positionOverlayNearGame(status.current_game, state.prefs.anchor);
        } else {
          await hide();
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('failed to subscribe to game-window events', error);
      }
    })();

    return () => {
      cancelled = true;
      if (typeof unlistenChanged === 'function') unlistenChanged();
      if (typeof unlistenClosed === 'function') unlistenClosed();
      if (typeof unlistenNoGame === 'function') unlistenNoGame();
      if (typeof unlistenMinimised === 'function') unlistenMinimised();
    };
  }, [state.prefs.anchor]);

  useEffect(() => {
    if (!lastGameWindowRef.current) {
      return;
    }
    positionOverlayNearGame(lastGameWindowRef.current, state.prefs.anchor).catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('overlay anchor reposition failed', error);
    });
  }, [state.prefs.anchor]);

  // ---- Apply click-through to the host window -----------------------------
  useEffect(() => {
    if (!hydrated) return undefined;
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
  }, [hydrated, state.clickThrough]);

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

  // Local fallback while the overlay has focus. The global shortcut remains
  // authoritative when click-through prevents this window receiving input.
  // Global hotkey rebinding lives on the main window via
  // `set_incoming_overlay_click_through` / shortcut.rs.
  useEffect(() => {
    const onKey = (e) => {
      const modifiers = new Set(shortcutConfig.modifiers.map(normalizeModifier));
      const modifiersMatch =
        e.ctrlKey === modifiers.has('Control') &&
        e.altKey === modifiers.has('Alt') &&
        e.shiftKey === modifiers.has('Shift') &&
        e.metaKey === modifiers.has('Meta');
      if (e.code === shortcutConfig.key && modifiersMatch) {
        e.preventDefault();
        dispatch({ type: 'click_through', value: !state.clickThrough });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcutConfig, state.clickThrough]);

  const anchor = state.prefs.anchor || 'right';
  const sourceMode =
    state.prefs.show_original === false
      ? 'never'
      : state.prefs.show_original_mode || 'always';
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
        <span>Lingo · {t('overlay.live')}</span>
        {state.paused && (
          <span style={{ marginLeft: 6, color: '#ffb347' }}>· {t('overlay.paused')}</span>
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
            {t('overlay.waiting')}
          </div>
        )}
        {state.messages.map((msg, idx) => {
          const team = state.prefs.team_color === false ? 'ally' : scopeTeam(msg.scope);
          const abbr = msg.sender || teamAbbr(msg.scope);
          const isNew = idx === state.messages.length - 1;
          const sourceMatchesTranslation =
            msg.source_text.trim() === msg.translated_text.trim();
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
                {sourceMode !== 'never' && msg.source_text && !sourceMatchesTranslation && (
                  <span
                    className={`lg-ticker__src ${
                      sourceMode === 'hover' ? 'lg-ticker__src--hover' : ''
                    }`}>
                    {msg.source_text}
                  </span>
                )}
              </div>
              <div className='lg-ticker__trg'>{msg.translated_text}</div>
            </div>
          );
        })}
      </div>

      {/* Click-through status — the OS ignores all pointer events while this
          mode is active, so restoration is intentionally hotkey-only. */}
      {state.clickThrough && (
        <div
          className='lg-ticker__handle'
          aria-hidden='true'
          style={{
            background: 'transparent',
            border: 0,
            color: 'rgba(240,243,250,.4)',
            cursor: 'default',
            textAlign: 'left',
            width: '100%',
          }}>
          <span className='lg-ticker__handle-chip'>{shortcutLabel}</span>
          <span>{t('overlay.clickThroughHint', { shortcut: shortcutLabel })}</span>
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
        </div>
      )}
    </div>
  );
}
