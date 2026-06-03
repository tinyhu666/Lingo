import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { CN, DE, ES, FR, JP, KR, RU, SG, US } from 'country-flag-icons/react/3x2';
import { useStore } from '../../components/StoreProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { Chip, Toggle, Kbd, PageHead } from '../../components/lg';
import {
  IBubbles,
  ICalibrate,
  ILock,
  IUnlock,
  ISliders,
  ITarget,
  IPower,
  IGamepad,
  IBolt,
  ISwap,
  IChevDown,
  IArrowR,
} from '../../icons';
import { Spinner } from '../../icons';
import {
  LANGUAGE_OPTIONS,
  getLanguageLabel,
  getLanguageMeta,
} from '../../constants/languages';
import {
  DEFAULT_GAME_SCENE,
  GAME_SCENE_OPTIONS,
  getGameSceneLabel,
  getGameSceneMeta,
} from '../../constants/gameScenes';
import {
  buildHotkeyFromKeyCodes,
  defaultTranslatorHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  isModifierKeyCode,
  normalizeModifier,
} from '../../constants/hotkeys';
import DropdownMenu from '../../components/DropdownMenu';
import IncomingCalibrationModal from '../../components/IncomingCalibrationModal';
import IncomingAdvancedSettingsModal from '../../components/IncomingAdvancedSettingsModal';
import {
  PERMISSION_STATES,
  getIncomingStatus,
  requestScreenRecordingPermission,
  setIncomingEnabled,
  setIncomingOverlayClickThrough,
} from '../../services/incomingService';
import { hasTauriRuntime, invokeCommand } from '../../services/tauriRuntime';
import { showError, showInfo, showSuccess } from '../../utils/toast';
import { toErrorMessage } from '../../utils/error';

const STATUS_NOTE_EVENTS = [
  'incoming:permission_required',
  'incoming:region_required',
  'incoming:capture_error',
  'incoming:ocr_error',
  'incoming:fatal',
];

const FLAG_COMPONENTS = { CN, SG, KR, US, FR, RU, ES, JP, DE };

const MENU_HEIGHT_PX = 276;

const heroBtnStyle = (active = false) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  border: `1px solid ${active ? 'rgba(22,163,107,.30)' : 'var(--lg-line-1)'}`,
  background: active ? 'rgba(230,246,238,.6)' : 'var(--lg-surf-1)',
  borderRadius: 12,
  cursor: 'pointer',
  textAlign: 'left',
  minHeight: 92,
  transition: 'all var(--lg-dur) var(--lg-ease)',
});

function IncomingHero() {
  const { settings, syncSettings } = useStore();
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(false);
  const [clickPending, setClickPending] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const persistedEnabled = Boolean(settings?.incoming_enabled);
  const gameScene = settings?.game_scene || DEFAULT_GAME_SCENE;
  const region = settings?.incoming_regions?.[gameScene] || null;
  const hasRegion = Boolean(region);
  const clickThrough = Boolean(settings?.incoming_overlay?.click_through);

  const refreshStatus = useCallback(async () => {
    if (!hasTauriRuntime()) {
      setStatus(null);
      return;
    }
    try {
      const next = await getIncomingStatus();
      setStatus(next);
    } catch (error) {
      console.warn('failed to load incoming status', error);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, persistedEnabled, gameScene, hasRegion]);

  // Load-bearing: the Windows incoming-translation flow emits status events
  // when capture/OCR can't run. Surface them as toasts; otherwise the card
  // would silently sit on "Ready" while nothing actually translates.
  useEffect(() => {
    if (!hasTauriRuntime()) return undefined;
    let cancelled = false;
    const unlisteners = [];
    (async () => {
      for (const eventName of STATUS_NOTE_EVENTS) {
        try {
          const unlisten = await listen(eventName, (event) => {
            if (cancelled) return;
            const payload = event.payload;
            const message =
              typeof payload === 'string' && payload.trim()
                ? payload
                : t('home.incoming.statusNote', { event: eventName });
            showError(message);
            void refreshStatus();
          });
          if (cancelled) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        } catch (error) {
          console.warn(`failed to listen for ${eventName}`, error);
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const u of unlisteners) {
        try {
          u();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [refreshStatus, t]);

  const permission = status?.permission || PERMISSION_STATES.UNKNOWN;
  const permissionMissing = permission === PERMISSION_STATES.DENIED;
  const needsRegion = persistedEnabled && !hasRegion;
  const needsPermission = persistedEnabled && permissionMissing;

  const chipInfo = useMemo(() => {
    if (!persistedEnabled) {
      return { tone: 'default', text: t('home.incoming.statusDisabled'), dot: true };
    }
    if (needsPermission) {
      return { tone: 'warn', text: t('home.incoming.statusPermission'), dot: true };
    }
    if (needsRegion) {
      return { tone: 'warn', text: t('home.incoming.statusNeedsRegion'), dot: true };
    }
    return { tone: 'success', text: t('home.incoming.statusActive'), dot: true };
  }, [persistedEnabled, needsPermission, needsRegion, t]);

  const handleToggle = async () => {
    if (pending) return;
    const nextEnabled = !persistedEnabled;
    setPending(true);
    try {
      if (hasTauriRuntime()) {
        const latest = await setIncomingEnabled(nextEnabled);
        if (latest && typeof latest === 'object') {
          await syncSettings(latest);
        }
      } else {
        await syncSettings({ ...(settings || {}), incoming_enabled: nextEnabled });
      }

      if (nextEnabled) {
        showSuccess(t('home.incoming.toggleEnabledSuccess'));
        if (!hasRegion) {
          showInfo(t('home.incoming.regionHintToast', { scene: gameScene }));
        } else if (permissionMissing) {
          showInfo(t('home.incoming.permissionHintToast'));
        }
      } else {
        showSuccess(t('home.incoming.toggleDisabledSuccess'));
      }

      void refreshStatus();
    } catch (error) {
      showError(t('home.incoming.toggleFailed', { error: toErrorMessage(error) }));
    } finally {
      setPending(false);
    }
  };

  const handleClickThroughToggle = async () => {
    if (clickPending) return;
    const next = !clickThrough;
    setClickPending(true);
    try {
      if (hasTauriRuntime()) {
        const latest = await setIncomingOverlayClickThrough(next);
        if (latest && typeof latest === 'object') {
          await syncSettings(latest);
        }
      } else {
        await syncSettings({
          ...(settings || {}),
          incoming_overlay: { ...(settings?.incoming_overlay || {}), click_through: next },
        });
      }
      showSuccess(
        next ? t('home.incoming.clickThroughLocked') : t('home.incoming.clickThroughUnlocked'),
      );
    } catch (error) {
      showError(t('home.incoming.clickThroughFailed', { error: toErrorMessage(error) }));
    } finally {
      setClickPending(false);
    }
  };

  const handleRequestPermission = useCallback(async () => {
    try {
      await requestScreenRecordingPermission();
      showInfo(t('home.incoming.permissionRequested'));
      void refreshStatus();
    } catch (error) {
      showError(t('home.incoming.permissionRequestFailed', { error: toErrorMessage(error) }));
    }
  }, [refreshStatus, t]);

  const clickThroughShortcut = settings?.incoming_click_through_hotkey?.shortcut || '';

  const regionMeta = hasRegion
    ? `${region.bounds?.x ?? 0},${region.bounds?.y ?? 0} · ${region.bounds?.w ?? 0}×${region.bounds?.h ?? 0}`
    : t('home.incoming.calibrateRegion');

  return (
    <>
      <div className='lg-card lg-card--hero' style={{ gridColumn: '1 / -1' }}>
        <div className='lg-card__head'>
          <div className='lg-card__icon lg-card__icon--brand'>
            <IBubbles />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className='lg-card__title'>{t('home.incoming.title')}</div>
              <Chip tone='brand'>{t('home.heroBadgeNew')}</Chip>
            </div>
            <div className='lg-card__sub'>{t('home.heroSub')}</div>
          </div>
          <div className='lg-card__actions'>
            <Chip tone={chipInfo.tone} dot={chipInfo.dot}>
              {chipInfo.text}
            </Chip>
            <Toggle
              on={persistedEnabled}
              onClick={handleToggle}
              disabled={pending}
              ariaLabel={t('home.incoming.title')}
            />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
            gap: 10,
            marginTop: 4,
          }}>
          {/* Preview strip */}
          <div
            style={{
              gridRow: 'span 1',
              padding: '10px 12px',
              background: 'linear-gradient(120deg, rgba(11,20,48,.92), rgba(45,40,90,.92))',
              borderRadius: 12,
              color: '#f0f3fa',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              minHeight: 92,
              overflow: 'hidden',
              position: 'relative',
            }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'rgba(240,243,250,.55)',
                fontWeight: 700,
              }}>
              <span className='lg-ticker__live' />
              {t('home.heroPreviewLabel')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#61ebff' }}>
                  {t('home.heroPreviewAllyTeam')}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'rgba(240,243,250,.55)',
                    fontStyle: 'italic',
                  }}>
                  {t('home.heroPreviewAllySrc')}
                </span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t('home.heroPreviewAllyTrg')}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#ff9c8c' }}>
                  {t('home.heroPreviewEnemyTeam')}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: 'rgba(240,243,250,.55)',
                    fontStyle: 'italic',
                  }}>
                  {t('home.heroPreviewEnemySrc')}
                </span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t('home.heroPreviewEnemyTrg')}</div>
            </div>
          </div>

          {/* Action: calibrate */}
          <button
            type='button'
            style={heroBtnStyle()}
            onClick={() => setCalibrationOpen(true)}>
            <ICalibrate style={{ color: '#4d70f5', width: 20, height: 20 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--lg-ink-0)' }}>
                {t('home.incoming.calibrateRegion')}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--lg-ink-3)',
                  marginTop: 2,
                  fontFamily: 'var(--lg-mono)',
                }}>
                {regionMeta}
              </div>
            </div>
          </button>

          {/* Action: click-through / lock */}
          <button
            type='button'
            style={heroBtnStyle(clickThrough)}
            onClick={handleClickThroughToggle}
            disabled={clickPending}
            aria-pressed={clickThrough}>
            {clickThrough ? (
              <ILock style={{ color: '#16a36b', width: 20, height: 20 }} />
            ) : (
              <IUnlock style={{ color: 'var(--lg-ink-2)', width: 20, height: 20 }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--lg-ink-0)' }}>
                {clickThrough ? t('home.incoming.clickThroughOn') : t('home.incoming.clickThroughOff')}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--lg-ink-3)',
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                {t('home.incoming.hotkeyLockLabel')}
                {clickThroughShortcut ? <span>{clickThroughShortcut}</span> : null}
              </div>
            </div>
          </button>

          {/* Action: advanced */}
          <button
            type='button'
            style={heroBtnStyle()}
            onClick={() => setAdvancedOpen(true)}>
            <ISliders style={{ color: 'var(--lg-ink-2)', width: 20, height: 20 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--lg-ink-0)' }}>
                {t('home.incoming.advancedSettings')}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--lg-ink-3)', marginTop: 2 }}>
                {t('home.heroBtnAdvancedHint')}
              </div>
            </div>
          </button>
        </div>

        {needsPermission ? (
          <div style={{ marginTop: 10 }}>
            <button
              type='button'
              className='lg-btn lg-btn--sm lg-btn--warn'
              onClick={handleRequestPermission}>
              {t('home.incoming.grantPermission')}
            </button>
          </div>
        ) : null}
      </div>

      <IncomingCalibrationModal
        open={calibrationOpen}
        onClose={() => setCalibrationOpen(false)}
        gameScene={gameScene}
        currentRegion={region}
        onSaved={refreshStatus}
      />

      <IncomingAdvancedSettingsModal
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        settings={settings}
        onChange={async (next) => {
          if (next && typeof next === 'object') {
            await syncSettings(next);
          }
        }}
      />
    </>
  );
}

function LangPicker({ value, onClick, expanded, uiLocale }) {
  const meta = getLanguageMeta(value, uiLocale);
  const FlagIcon = FLAG_COMPONENTS[meta.countryCode];
  return (
    <button
      type='button'
      onClick={onClick}
      aria-haspopup='menu'
      aria-expanded={expanded}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        padding: '8px 10px',
        borderRadius: 10,
        background: 'var(--lg-surf-2)',
        border: '1px solid var(--lg-line-1)',
        cursor: 'pointer',
        minWidth: 0,
      }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          overflow: 'hidden',
          flex: '0 0 20px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#eef2f7',
        }}>
        {FlagIcon ? <FlagIcon style={{ width: 28, height: 28, transform: 'scale(1.6)' }} /> : null}
      </span>
      <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: 'var(--lg-ink-0)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--lg-ink-3)', fontFamily: 'var(--lg-mono)' }}>
          {meta.id}
        </div>
      </div>
      <IChevDown style={{ width: 12, height: 12, marginLeft: 'auto', color: 'var(--lg-ink-3)' }} />
    </button>
  );
}

function DirectionCard() {
  const { settings, updateSettings } = useStore();
  const { locale, t } = useI18n();
  const [activeMenu, setActiveMenu] = useState(null);
  const fromTriggerRef = useRef(null);
  const toTriggerRef = useRef(null);

  const from = settings?.translation_from || 'zh';
  const to = settings?.translation_to || 'en';

  const options = useMemo(
    () =>
      Object.fromEntries(
        LANGUAGE_OPTIONS.map((item) => [item.id, getLanguageLabel(item.id, locale)]),
      ),
    [locale],
  );

  const handleSelect = async (lang, field) => {
    setActiveMenu(null);
    try {
      await updateSettings({ [field]: lang });
    } catch (error) {
      showError(t('home.translationLanguage.updateFailed', { error: toErrorMessage(error) }));
    }
  };

  return (
    <div className='lg-card'>
      <div className='lg-card__head'>
        <div className='lg-card__icon'>
          <ISwap />
        </div>
        <div>
          <div className='lg-card__title'>{t('home.cardDirectionTitle')}</div>
          <div className='lg-card__sub'>{t('home.cardDirectionSub')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div ref={fromTriggerRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <LangPicker
            value={from}
            uiLocale={locale}
            expanded={activeMenu === 'from'}
            onClick={() => setActiveMenu(activeMenu === 'from' ? null : 'from')}
          />
          <DropdownMenu
            show={activeMenu === 'from'}
            onClose={() => setActiveMenu(null)}
            options={options}
            currentValue={from}
            onSelect={(lang) => handleSelect(lang, 'translation_from')}
            direction='down'
            anchorRef={fromTriggerRef}
          />
        </div>
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'var(--lg-surf-2)',
            color: 'var(--lg-ink-3)',
          }}>
          <IArrowR style={{ width: 14, height: 14 }} />
        </div>
        <div ref={toTriggerRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <LangPicker
            value={to}
            uiLocale={locale}
            expanded={activeMenu === 'to'}
            onClick={() => setActiveMenu(activeMenu === 'to' ? null : 'to')}
          />
          <DropdownMenu
            show={activeMenu === 'to'}
            onClose={() => setActiveMenu(null)}
            options={options}
            currentValue={to}
            onSelect={(lang) => handleSelect(lang, 'translation_to')}
            anchorPosition='right-0'
            direction='down'
            anchorRef={toTriggerRef}
          />
        </div>
      </div>
    </div>
  );
}

function EnableCard() {
  const { settings, updateSettings, syncSettings } = useStore();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [draftState, setDraftState] = useState(null);

  const persistedEnabled = settings?.app_enabled ?? true;
  const isEnabled = typeof draftState === 'boolean' ? draftState : persistedEnabled;

  useEffect(() => {
    setDraftState(null);
  }, [persistedEnabled]);

  const handleToggle = async () => {
    if (pending) return;
    const next = !isEnabled;
    setDraftState(next);
    setPending(true);
    try {
      if (hasTauriRuntime()) {
        const latest = await invokeCommand('set_app_enabled', { enabled: next });
        if (latest && typeof latest === 'object') {
          await syncSettings(latest);
        } else {
          await updateSettings({ app_enabled: next });
        }
      } else {
        await updateSettings({ app_enabled: next });
      }
      showSuccess(
        next ? t('home.enableStatus.toggleEnabledSuccess') : t('home.enableStatus.togglePausedSuccess'),
      );
    } catch (error) {
      setDraftState(null);
      showError(t('home.enableStatus.toggleFailed', { error: toErrorMessage(error) }));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className='lg-card'>
      <div className='lg-card__head'>
        <div className='lg-card__icon'>
          <IPower />
        </div>
        <div>
          <div className='lg-card__title'>{t('home.enableStatus.title')}</div>
          <div className='lg-card__sub'>{t('home.cardEnableSub')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 10, height: 10 }}>
            <div className={isEnabled ? 'lg-pulse' : ''} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--lg-ink-0)' }}>
              {isEnabled ? t('common.enabled') : t('common.paused')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--lg-ink-3)', marginTop: 1 }}>
              {t('home.cardEnableIdleMeta')}
            </div>
          </div>
        </div>
        <Toggle
          on={isEnabled}
          onClick={handleToggle}
          disabled={pending}
          ariaLabel={t('home.enableStatus.title')}
        />
      </div>
    </div>
  );
}

function GameCard() {
  const { settings, updateSettings } = useStore();
  const { locale, t } = useI18n();
  const currentScene = settings?.game_scene || DEFAULT_GAME_SCENE;

  const handleSelect = async (id) => {
    if (id === currentScene) return;
    try {
      await updateSettings({ game_scene: id });
    } catch (error) {
      showError(t('home.gameScene.updateFailed', { error: toErrorMessage(error) }));
    }
  };

  return (
    <div className='lg-card'>
      <div className='lg-card__head'>
        <div className='lg-card__icon'>
          <IGamepad />
        </div>
        <div>
          <div className='lg-card__title'>{t('home.gameScene.title')}</div>
          <div className='lg-card__sub'>{t('home.cardGameSub')}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {GAME_SCENE_OPTIONS.slice(0, 4).map((g) => {
          const meta = getGameSceneMeta(g.id, locale);
          const active = g.id === currentScene;
          return (
            <button
              key={g.id}
              type='button'
              onClick={() => handleSelect(g.id)}
              style={{
                padding: '10px 8px',
                border: `1px solid ${active ? 'rgba(112,133,250,.4)' : 'var(--lg-line-1)'}`,
                background: active ? 'rgba(112,133,250,.06)' : 'var(--lg-surf-1)',
                borderRadius: 10,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                transition: 'all var(--lg-dur) var(--lg-ease)',
              }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  overflow: 'hidden',
                  background: '#e2e8f1',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 11,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2)',
                }}>
                {meta.icon ? (
                  <img
                    src={meta.icon}
                    alt=''
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: meta.iconFit === 'cover' ? 'cover' : 'contain',
                    }}
                  />
                ) : (
                  <IGamepad style={{ width: 14, height: 14, color: 'var(--lg-ink-3)' }} />
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--lg-ink-1)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}>
                {getGameSceneLabel(g.id, locale)}
              </div>
            </button>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: 'var(--lg-ink-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--lg-info)' }} />
        {t('home.cardGameHint')}
      </div>
    </div>
  );
}

const formatPreview = (codes) =>
  codes
    .map((code) =>
      isModifierKeyCode(code) ? formatModifierLabel(normalizeModifier(code)) : formatMainKeyLabel(code),
    )
    .join(' + ');

function HotkeyCard() {
  const { settings, updateSettings, syncSettings } = useStore();
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [capturedCodes, setCapturedCodes] = useState([]);

  const codesRef = useRef([]);
  const committingRef = useRef(false);

  const stopRecording = useCallback(() => {
    codesRef.current = [];
    setCapturedCodes([]);
    setRecording(false);
    committingRef.current = false;
  }, []);

  const commitHotkey = useCallback(async () => {
    if (committingRef.current) return;
    committingRef.current = true;
    const keys = [...codesRef.current];
    if (keys.length === 0) {
      stopRecording();
      return;
    }
    try {
      if (hasTauriRuntime()) {
        const latest = await invokeCommand('update_translator_shortcut', { keys });
        await syncSettings(latest);
        showSuccess(t('home.hotkey.setSuccess'));
      } else {
        const hotkey = buildHotkeyFromKeyCodes(keys);
        await updateSettings({ trans_hotkey: hotkey });
        showSuccess(t('home.hotkey.previewSuccess'));
      }
    } catch (error) {
      showError(t('home.hotkey.setFailed', { error: toErrorMessage(error) }));
    } finally {
      stopRecording();
    }
  }, [syncSettings, stopRecording, updateSettings, t]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        stopRecording();
        return;
      }
      const code = event.code;
      if (!code || codesRef.current.includes(code)) return;
      codesRef.current = [...codesRef.current, code];
      setCapturedCodes(codesRef.current);
    },
    [recording, stopRecording],
  );

  const handleKeyUp = useCallback(
    (event) => {
      if (!recording) return;
      const hasMainKey = codesRef.current.some((code) => !isModifierKeyCode(code));
      if (!hasMainKey) return;
      event.preventDefault();
      event.stopPropagation();
      void commitHotkey();
    },
    [recording, commitHotkey],
  );

  useEffect(() => {
    if (!recording) return undefined;
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [recording, handleKeyDown, handleKeyUp]);

  const beginRecording = () => {
    if (recording) {
      stopRecording();
      return;
    }
    setRecording(true);
    codesRef.current = [];
    setCapturedCodes([]);
  };

  // Build the labels for the outgoing translate hotkey
  const translateKeys = useMemo(() => {
    if (recording && capturedCodes.length === 0) {
      return null; // spinner placeholder
    }
    if (recording) {
      return formatPreview(capturedCodes).split(' + ');
    }
    const storedHotkey = settings?.trans_hotkey;
    if (storedHotkey?.key) {
      const labels = [
        ...(storedHotkey.modifiers || []).map((m) => formatModifierLabel(normalizeModifier(m))),
        formatMainKeyLabel(storedHotkey.key),
      ].filter(Boolean);
      if (labels.length > 0) return labels;
    }
    return defaultTranslatorHotkeyLabel().split('+');
  }, [recording, capturedCodes, settings?.trans_hotkey]);

  const incomingShortcut = settings?.incoming_toggle_hotkey?.shortcut || '';
  const incomingKeys = incomingShortcut ? incomingShortcut.split('+') : ['⌘', '⇧', 'T'];
  const lockShortcut = settings?.incoming_click_through_hotkey?.shortcut || '';
  const lockKeys = lockShortcut ? lockShortcut.split('+') : ['⌥', 'L'];

  const rows = [
    {
      key: 'translate',
      label: t('home.cardHotkeyRowTranslate'),
      hint: t('home.cardHotkeyRowTranslateHint'),
      keys: translateKeys,
      onClick: beginRecording,
    },
    {
      key: 'incoming',
      label: t('home.cardHotkeyRowIncoming'),
      hint: t('home.cardHotkeyRowIncomingHint'),
      keys: incomingKeys,
    },
    {
      key: 'lock',
      label: t('home.cardHotkeyRowLock'),
      hint: t('home.cardHotkeyRowLockHint'),
      keys: lockKeys,
    },
  ];

  return (
    <div className='lg-card'>
      <div className='lg-card__head'>
        <div className='lg-card__icon'>
          <IBolt />
        </div>
        <div>
          <div className='lg-card__title'>{t('home.cardHotkeyTitle')}</div>
          <div className='lg-card__sub'>
            {recording ? t('home.hotkey.recordingHint') : t('home.cardHotkeySub')}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => (
          <div
            key={r.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--lg-line-3)',
              cursor: r.onClick ? 'pointer' : 'default',
            }}
            onClick={r.onClick}
            role={r.onClick ? 'button' : undefined}
            tabIndex={r.onClick ? 0 : -1}
            onKeyDown={
              r.onClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      r.onClick();
                    }
                  }
                : undefined
            }>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lg-ink-0)' }}>{r.label}</div>
              <div style={{ fontSize: 10.5, color: 'var(--lg-ink-3)', marginTop: 1 }}>{r.hint}</div>
            </div>
            {r.keys === null ? (
              <Spinner style={{ width: 16, height: 16, color: 'var(--lg-ink-3)' }} />
            ) : (
              <Kbd keys={r.keys} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { settings } = useStore();
  const { t } = useI18n();
  const enabled = settings?.app_enabled ?? true;

  return (
    <>
      <PageHead
        title={t('home.pageTitle')}
        sub={t('home.pageSub')}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Chip tone={enabled ? 'success' : 'warn'} dot lg>
              {enabled ? t('sidebar.serviceRunning') : t('sidebar.servicePaused')}
            </Chip>
            <button type='button' className='lg-btn lg-btn--sm'>
              <ITarget /> {t('home.heroTryBtn')}
            </button>
          </div>
        }
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
        }}>
        <IncomingHero />
        <DirectionCard />
        <EnableCard />
        <GameCard />
        <HotkeyCard />
      </div>
    </>
  );
}
