import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CN, DE, ES, FR, JP, KR, RU, SG, US } from 'country-flag-icons/react/3x2';
import { useStore } from '../../components/StoreProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { Chip, Toggle, Kbd, PageHead } from '../../components/lg';
import {
  ITarget,
  IPower,
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
  buildHotkeyFromKeyCodes,
  defaultTranslatorHotkeyCodes,
  defaultTranslatorHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  isModifierKeyCode,
  normalizeModifier,
} from '../../constants/hotkeys';
import DropdownMenu from '../../components/DropdownMenu';
import { hasTauriRuntime, invokeCommand } from '../../services/tauriRuntime';
import { showError, showSuccess } from '../../utils/toast';
import { toErrorMessage } from '../../utils/error';

const FLAG_COMPONENTS = { CN, SG, KR, US, FR, RU, ES, JP, DE };

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
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--lg-ink-0)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--lg-ink-3)', fontFamily: 'var(--lg-mono)' }}>
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
            <div style={{ fontSize: 12, color: 'var(--lg-ink-3)', marginTop: 1 }}>
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

const formatPreview = (codes) =>
  codes
    .map((code) =>
      isModifierKeyCode(code) ? formatModifierLabel(normalizeModifier(code)) : formatMainKeyLabel(code),
    )
    .join(' + ');

function HotkeyCard() {
  const { settings, updateSettings, syncSettings } = useStore();
  const { t } = useI18n();
  const [recorderState, setRecorderState] = useState('idle');
  const [capturedCodes, setCapturedCodes] = useState([]);
  const [inlineError, setInlineError] = useState('');

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

  const persistHotkey = useCallback(async (keys, successMessageKey = 'setSuccess') => {
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
  }, [resetRecorder, syncSettings, updateSettings, t]);

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

  const currentKeys = useMemo(() => {
    const storedHotkey = settings?.trans_hotkey;
    if (storedHotkey?.key) {
      const labels = [
        ...(storedHotkey.modifiers || []).map((m) => formatModifierLabel(normalizeModifier(m))),
        formatMainKeyLabel(storedHotkey.key),
      ].filter(Boolean);
      if (labels.length > 0) return labels;
    }
    return defaultTranslatorHotkeyLabel().split('+');
  }, [settings?.trans_hotkey]);

  const previewKeys = capturedCodes.length > 0 ? formatPreview(capturedCodes).split(' + ') : [];

  const restoreDefault = () => {
    void persistHotkey(defaultTranslatorHotkeyCodes(), 'restoreDefaultSuccess');
  };

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
      <div className={`hotkey-setting${recording ? ' hotkey-setting--recording' : ''}`}>
        <div className='hotkey-setting__copy'>
          <div className='hotkey-setting__label'>{t('home.cardHotkeyRowTranslate')}</div>
          <div className='hotkey-setting__hint'>{t('home.cardHotkeyRowTranslateHint')}</div>
        </div>
        <div className='hotkey-setting__controls'>
          <div className='hotkey-setting__status' aria-live='polite' aria-atomic='true'>
            {recording ? (
              previewKeys.length > 0 ? (
                <Kbd keys={previewKeys} />
              ) : (
                <span className='hotkey-setting__listening'>{t('home.hotkey.pressCombo')}</span>
              )
            ) : (
              <Kbd keys={currentKeys} />
            )}
          </div>
          <button
            type='button'
            className={`lg-btn lg-btn--sm${recording ? ' lg-btn--warn' : ' lg-btn--primary'}`}
            onClick={recording ? cancelRecording : beginRecording}
            disabled={saving}
            aria-describedby='translator-hotkey-help'>
            {saving ? <Spinner style={{ width: 14, height: 14 }} /> : null}
            {saving
              ? t('home.hotkey.saving')
              : recording
                ? t('home.hotkey.cancel')
                : t('home.hotkey.change')}
          </button>
          <button
            type='button'
            className='lg-btn lg-btn--sm lg-btn--ghost'
            onClick={restoreDefault}
            disabled={recording || saving}>
            {t('home.cardHotkeyResetDefault')}
          </button>
        </div>
      </div>
      <div
        id='translator-hotkey-help'
        className={`hotkey-setting__message${inlineError ? ' hotkey-setting__message--error' : ''}`}
        role={inlineError ? 'alert' : 'status'}>
        {inlineError || (recording ? t('home.hotkey.escapeHint') : t('home.hotkey.currentHint'))}
      </div>
    </div>
  );
}

function WorkflowCard() {
  const { t } = useI18n();
  const steps = [
    {
      number: '1',
      title: t('home.workflowStep1Title'),
      desc: t('home.workflowStep1Desc'),
    },
    {
      number: '2',
      title: t('home.workflowStep2Title'),
      desc: t('home.workflowStep2Desc'),
    },
    {
      number: '3',
      title: t('home.workflowStep3Title'),
      desc: t('home.workflowStep3Desc'),
    },
  ];

  return (
    <div className='lg-card'>
      <div className='lg-card__head' style={{ marginBottom: 12 }}>
        <div className='lg-card__icon'>
          <ITarget />
        </div>
        <div>
          <div className='lg-card__title'>{t('home.cardWorkflowTitle')}</div>
          <div className='lg-card__sub'>{t('home.cardWorkflowSub')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        {steps.map((step, index) => (
          <div key={step.number} style={{ display: 'contents' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flex: 1,
                minWidth: 0,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--lg-surf-2)',
                border: '1px solid var(--lg-line-1)',
              }}>
              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 26,
                  height: 26,
                  flex: '0 0 26px',
                  borderRadius: 8,
                  background: '#3158d4',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: 'var(--lg-mono)',
                }}>
                {step.number}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--lg-ink-0)' }}>
                  {step.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--lg-ink-2)', marginTop: 2 }}>
                  {step.desc}
                </div>
              </div>
            </div>
            {index < steps.length - 1 ? (
              <div
                aria-hidden='true'
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 18px',
                  color: 'var(--lg-ink-3)',
                }}>
                <IArrowR style={{ width: 13, height: 13 }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home({ onNavigate }) {
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
            <button
              type='button'
              className='lg-btn lg-btn--sm'
              onClick={() => onNavigate?.('translate')}>
              <ITarget /> {t('home.heroTryBtn')}
            </button>
          </div>
        }
      />
      <div className='home-main-grid'>
        <DirectionCard />
        <EnableCard />
        <div className='home-main-grid__wide'>
          <HotkeyCard />
        </div>
        <div className='home-main-grid__wide'>
          <WorkflowCard />
        </div>
      </div>
    </>
  );
}
