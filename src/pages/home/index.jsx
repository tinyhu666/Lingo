import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CN, DE, ES, FR, JP, KR, RU, SG, US } from 'country-flag-icons/react/3x2';
import { useStore } from '../../components/StoreProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { Chip, Kbd, Toggle } from '../../components/lg';
import { IChevDown, ISwap } from '../../icons';
import { LANGUAGE_OPTIONS, getLanguageLabel, getLanguageMeta } from '../../constants/languages';
import { DEFAULT_GAME_SCENE, GAME_SCENE_OPTIONS, getGameSceneMeta } from '../../constants/gameScenes';
import {
  buildHotkeyFromKeyCodes,
  defaultTranslatorHotkeyCodes,
  defaultTranslatorHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  hotkeyLabelsFromSettings,
  isModifierKeyCode,
  normalizeModifier,
} from '../../constants/hotkeys';
import DropdownMenu from '../../components/DropdownMenu';
import { hasTauriRuntime, invokeCommand } from '../../services/tauriRuntime';
import { showError, showSuccess } from '../../utils/toast';
import { toErrorMessage } from '../../utils/error';
import DemoStage from './DemoStage';

const FLAG_COMPONENTS = { CN, SG, KR, US, FR, RU, ES, JP, DE };

function LangPicker({ value, onClick, expanded, uiLocale, ariaLabel }) {
  const meta = getLanguageMeta(value, uiLocale);
  const FlagIcon = FLAG_COMPONENTS[meta.countryCode];
  return (
    <button
      type='button'
      onClick={onClick}
      aria-haspopup='menu'
      aria-expanded={expanded}
      aria-label={ariaLabel}
      className='lg-select__trigger'>
      <span className='lg-flag' aria-hidden='true'>
        {FlagIcon ? <FlagIcon /> : null}
      </span>
      <span className='lg-select__label'>{meta.label}</span>
      <IChevDown className='lg-select__chevron' aria-hidden='true' />
    </button>
  );
}

function renderLanguageOption(value, label, uiLocale) {
  const meta = getLanguageMeta(value, uiLocale);
  const FlagIcon = FLAG_COMPONENTS[meta.countryCode];
  return (
    <span>
      <span className='lg-flag' aria-hidden='true'>
        {FlagIcon ? <FlagIcon /> : null}
      </span>
      <span>{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Enable toggle (top status bar)                                      */
/* ------------------------------------------------------------------ */
function EnableCard({ onChange }) {
  const { settings, updateSettings, syncSettings } = useStore();
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [draftState, setDraftState] = useState(null);

  const persistedEnabled = settings?.app_enabled ?? true;
  const isEnabled = typeof draftState === 'boolean' ? draftState : persistedEnabled;

  useEffect(() => {
    setDraftState(null);
  }, [persistedEnabled]);

  useEffect(() => {
    onChange?.(isEnabled);
  }, [isEnabled, onChange]);

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
    <div className='home__top lg-rise' style={{ '--i': 0 }}>
      <Chip tone={isEnabled ? 'success' : 'warn'} dot>
        {isEnabled ? t('home.status.running') : t('home.status.paused')}
      </Chip>
      <div className='home__master'>
        <span>{t('home.enableStatus.title')}</span>
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

/* ------------------------------------------------------------------ */
/* Game selector                                                       */
/* ------------------------------------------------------------------ */
function GameSceneCard() {
  const { settings, updateSettings } = useStore();
  const { locale, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef(null);
  const selected = settings?.game_scene || DEFAULT_GAME_SCENE;
  const selectedMeta = getGameSceneMeta(selected, locale);
  const options = useMemo(
    () =>
      Object.fromEntries(
        GAME_SCENE_OPTIONS.map((item) => [item.id, getGameSceneMeta(item.id, locale).label]),
      ),
    [locale],
  );

  const handleSelect = async (gameScene) => {
    setMenuOpen(false);
    try {
      await updateSettings({ game_scene: gameScene });
    } catch (error) {
      showError(t('home.gameScene.updateFailed', { error: toErrorMessage(error) }));
    }
  };

  const renderBadge = (meta) => (
    <span className='lg-gamebadge' aria-hidden='true'>
      {meta.icon ? (
        <img src={meta.icon} alt='' className={meta.iconFit === 'cover' ? 'is-cover' : 'is-contain'} />
      ) : (
        '··'
      )}
    </span>
  );

  const renderGame = (value, label) => {
    const meta = getGameSceneMeta(value, locale);
    return (
      <span>
        {renderBadge(meta)}
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className='home__group'>
      <span className='lg-eyebrow'>{t('home.gameScene.label')}</span>
      <div ref={triggerRef} className='lg-select lg-select--lg' style={{ width: 200 }}>
        <button
          type='button'
          className='lg-select__trigger'
          aria-haspopup='menu'
          aria-expanded={menuOpen}
          aria-label={t('home.gameScene.title')}
          onClick={() => setMenuOpen((open) => !open)}>
          {renderBadge(selectedMeta)}
          <span className='lg-select__label'>{selectedMeta.label}</span>
          <IChevDown className='lg-select__chevron' aria-hidden='true' />
        </button>
        <DropdownMenu
          show={menuOpen}
          onClose={() => setMenuOpen(false)}
          options={options}
          currentValue={selectedMeta.id}
          onSelect={handleSelect}
          direction='up'
          anchorRef={triggerRef}
          renderOption={renderGame}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Language direction                                                  */
/* ------------------------------------------------------------------ */
function DirectionCard() {
  const { settings, updateSettings } = useStore();
  const { locale, t } = useI18n();
  const [activeMenu, setActiveMenu] = useState(null);
  const [spun, setSpun] = useState(false);
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

  const handleSwap = async () => {
    setSpun((value) => !value);
    try {
      await updateSettings({ translation_from: to, translation_to: from });
    } catch (error) {
      showError(t('home.translationLanguage.updateFailed', { error: toErrorMessage(error) }));
    }
  };

  const renderOption = (value, label) => renderLanguageOption(value, label, locale);

  return (
    <div className='home__group'>
      <span className='lg-eyebrow'>{t('home.translationLanguage.title')}</span>
      <div className='home__row'>
        <div ref={fromTriggerRef} className='lg-select lg-select--lg' style={{ width: 168 }}>
          <LangPicker
            value={from}
            uiLocale={locale}
            ariaLabel={t('home.translationLanguage.from')}
            expanded={activeMenu === 'from'}
            onClick={() => setActiveMenu(activeMenu === 'from' ? null : 'from')}
          />
          <DropdownMenu
            show={activeMenu === 'from'}
            onClose={() => setActiveMenu(null)}
            options={options}
            currentValue={from}
            onSelect={(lang) => handleSelect(lang, 'translation_from')}
            direction='up'
            anchorRef={fromTriggerRef}
            renderOption={renderOption}
          />
        </div>
        <button
          type='button'
          className={`lg-swap lg-swap--lg${spun ? ' lg-swap--spin' : ''}`}
          onClick={handleSwap}
          aria-label={t('home.translationLanguage.swap')}
          title={t('home.translationLanguage.swap')}>
          <ISwap aria-hidden='true' />
        </button>
        <div ref={toTriggerRef} className='lg-select lg-select--lg' style={{ width: 168 }}>
          <LangPicker
            value={to}
            uiLocale={locale}
            ariaLabel={t('home.translationLanguage.to')}
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
            direction='up'
            anchorRef={toTriggerRef}
            renderOption={renderOption}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hotkey recorder                                                     */
/* ------------------------------------------------------------------ */
const formatPreview = (codes) =>
  codes.map((code) =>
    isModifierKeyCode(code) ? formatModifierLabel(normalizeModifier(code)) : formatMainKeyLabel(code),
  );

function HotkeyCard() {
  const { settings, updateSettings, syncSettings } = useStore();
  const { t } = useI18n();
  const [recorderState, setRecorderState] = useState('idle');
  const [capturedCodes, setCapturedCodes] = useState([]);
  const [inlineError, setInlineError] = useState('');
  const [flash, setFlash] = useState(false);

  const codesRef = useRef([]);
  const committingRef = useRef(false);
  const recording = recorderState === 'recording';
  const saving = recorderState === 'saving';

  const resetRecorder = useCallback((nextState = 'idle') => {
    codesRef.current = [];
    setCapturedCodes([]);
    setRecorderState(nextState);
    committingRef.current = false;
  }, []);

  const cancelRecording = useCallback(() => {
    setInlineError('');
    resetRecorder('idle');
  }, [resetRecorder]);

  const flashOk = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
  }, []);

  const persistHotkey = useCallback(
    async (keys, successMessageKey = 'setSuccess') => {
      if (committingRef.current) return;
      let hotkey;
      try {
        hotkey = buildHotkeyFromKeyCodes(keys);
      } catch {
        setInlineError(t('home.hotkey.invalidCombo'));
        resetRecorder('error');
        return;
      }

      committingRef.current = true;
      setRecorderState('saving');
      setInlineError('');
      try {
        if (hasTauriRuntime()) {
          const latest = await invokeCommand('update_translator_shortcut', { keys });
          await syncSettings(latest);
        } else {
          await updateSettings({ trans_hotkey: hotkey });
        }
        showSuccess(t(`home.hotkey.${hasTauriRuntime() ? successMessageKey : 'previewSuccess'}`));
        resetRecorder('idle');
        flashOk();
      } catch (error) {
        const message = t('home.hotkey.setFailed', { error: toErrorMessage(error) });
        setInlineError(message);
        setRecorderState('error');
        showError(message);
      } finally {
        codesRef.current = [];
        setCapturedCodes([]);
        committingRef.current = false;
      }
    },
    [resetRecorder, syncSettings, updateSettings, t, flashOk],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        cancelRecording();
        return;
      }
      if (event.repeat) return;
      const code = event.code;
      if (!code || codesRef.current.includes(code)) return;
      codesRef.current = [...codesRef.current, code];
      setCapturedCodes(codesRef.current);
    },
    [recording, cancelRecording],
  );

  const handleKeyUp = useCallback(
    (event) => {
      if (!recording) return;
      const mainKey = [...codesRef.current].reverse().find((code) => !isModifierKeyCode(code));
      if (!mainKey || event.code !== mainKey) return;
      event.preventDefault();
      event.stopPropagation();
      void persistHotkey([...codesRef.current]);
    },
    [recording, persistHotkey],
  );

  useEffect(() => {
    if (!recording) return undefined;
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', cancelRecording);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', cancelRecording);
    };
  }, [recording, handleKeyDown, handleKeyUp, cancelRecording]);

  const beginRecording = () => {
    setInlineError('');
    setRecorderState('recording');
    codesRef.current = [];
    setCapturedCodes([]);
  };

  const currentKeys = useMemo(() => hotkeyLabelsFromSettings(settings), [settings]);
  const defaultKeys = useMemo(() => defaultTranslatorHotkeyLabel().split('+'), []);
  const isDefault = currentKeys.join('+') === defaultKeys.join('+');
  const previewKeys = capturedCodes.length > 0 ? formatPreview(capturedCodes) : [];
  const displayKeys = recording ? (previewKeys.length > 0 ? [...previewKeys, '…'] : ['…']) : currentKeys;

  const restoreDefault = () => {
    void persistHotkey(defaultTranslatorHotkeyCodes(), 'restoreDefaultSuccess');
  };

  const hint = saving
    ? t('home.hotkey.saving')
    : recording
      ? t('home.hotkey.pressCombo')
      : inlineError || t('home.hotkey.clickToChange');

  const recorderClass = [
    'hotkey-rec',
    recording ? 'hotkey-rec--recording' : '',
    flash ? 'hotkey-rec--ok' : '',
    recorderState === 'error' ? 'hotkey-rec--error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className='home__group'>
      <span className='lg-eyebrow'>{t('home.cardHotkeyTitle')}</span>
      <div className='home__row'>
        <button
          type='button'
          className={recorderClass}
          onClick={recording ? cancelRecording : beginRecording}
          disabled={saving}
          aria-label={t('home.hotkey.recorderAria')}
          aria-describedby='translator-hotkey-help'
          title={recording ? t('home.hotkey.escapeHint') : t('home.hotkey.clickToChange')}>
          <Kbd keys={displayKeys} recording={recording} />
          <span className='hotkey-rec__hint'>{hint}</span>
        </button>
        {!isDefault && !recording ? (
          <button
            type='button'
            className='lg-btn lg-btn--ghost lg-btn--sm'
            onClick={restoreDefault}
            disabled={saving}>
            {t('home.cardHotkeyResetDefault')}
          </button>
        ) : null}
      </div>
      <span id='translator-hotkey-help' className='sr-only' role={inlineError ? 'alert' : 'status'}>
        {inlineError || (recording ? t('home.hotkey.escapeHint') : t('home.hotkey.currentHint'))}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Home() {
  const { t } = useI18n();
  const { settings } = useStore();
  const [enabled, setEnabled] = useState(settings?.app_enabled ?? true);
  const hotkeyKeys = useMemo(() => hotkeyLabelsFromSettings(settings), [settings]);

  return (
    <div className='home'>
      <EnableCard onChange={setEnabled} />

      <div className={`home__focus lg-rise${enabled ? '' : ' home__focus--off'}`} style={{ '--i': 1 }}>
        <div className='home__copy'>
          <h1>{t('home.hero.title')}</h1>
          <p>
            {t('home.hero.before')}
            <Kbd keys={hotkeyKeys} size='sm' />
            {t('home.hero.after')}
          </p>
        </div>
        <DemoStage paused={!enabled} />
      </div>

      <div className='home__quick lg-rise' style={{ '--i': 2 }}>
        <GameSceneCard />
        <div className='home__divider' aria-hidden='true' />
        <DirectionCard />
        <div className='home__divider' aria-hidden='true' />
        <HotkeyCard />
      </div>
    </div>
  );
}
