import { invokeCommand, invokeIfPossible } from './tauriRuntime';

/**
 * Thin client over the Tauri commands defined in
 * `src-tauri/src/lib.rs` for the v0.7.0 incoming-chat translation feature.
 *
 * All functions tolerate the preview/non-Tauri environment by returning
 * sensible defaults (so the UI can render without crashing on the web).
 */

const PERMISSION_STATES = Object.freeze({
  UNKNOWN: 'unknown',
  GRANTED: 'granted',
  DENIED: 'denied',
  NOT_APPLICABLE: 'not_applicable',
});

export { PERMISSION_STATES };

const DEFAULT_STATUS = Object.freeze({
  enabled: false,
  active: false,
  permission: PERMISSION_STATES.UNKNOWN,
  current_game_scene: null,
  has_region_for_current_scene: false,
  capture_rate_hz: 1.5,
  last_error: null,
});

export const getIncomingStatus = async () => {
  const value = await invokeIfPossible('get_incoming_status', {}, null);
  return value || { ...DEFAULT_STATUS };
};

export const setIncomingEnabled = async (enabled) =>
  invokeCommand('set_incoming_enabled', { enabled: Boolean(enabled) });

export const saveIncomingChatRegion = async (gameScene, region) =>
  invokeCommand('save_incoming_chat_region', { gameScene, region });

export const clearIncomingChatRegion = async (gameScene) =>
  invokeCommand('clear_incoming_chat_region', { gameScene });

export const updateIncomingOverlayPreferences = async (preferences) =>
  invokeCommand('update_incoming_overlay_preferences', { preferences });

export const setIncomingCaptureRate = async (rateHz) =>
  invokeCommand('set_incoming_capture_rate', { rateHz: Number(rateHz) });

export const listDisplays = async () =>
  (await invokeIfPossible('list_displays', {}, null)) || [];

export const checkScreenRecordingPermission = async () =>
  (await invokeIfPossible(
    'check_screen_recording_permission',
    {},
    PERMISSION_STATES.UNKNOWN,
  )) || PERMISSION_STATES.UNKNOWN;

export const requestScreenRecordingPermission = async () =>
  (await invokeIfPossible(
    'request_screen_recording_permission',
    {},
    PERMISSION_STATES.UNKNOWN,
  )) || PERMISSION_STATES.UNKNOWN;

export const showIncomingOverlay = async () =>
  invokeIfPossible('show_incoming_overlay', {}, null);

export const hideIncomingOverlay = async () =>
  invokeIfPossible('hide_incoming_overlay', {}, null);

export const setIncomingOverlayClickThrough = async (clickThrough) =>
  invokeIfPossible('set_incoming_overlay_click_through', {
    clickThrough: Boolean(clickThrough),
  }, null);
