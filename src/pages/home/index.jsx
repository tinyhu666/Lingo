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

  const rows = [
    {
      key: 'translate',
      label: t('home.cardHotkeyRowTranslate'),
      hint: t('home.cardHotkeyRowTranslateHint'),
      keys: translateKeys,
      onClick: beginRecording,
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
              padding: '5px 0',
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
      <div
        className='home-main-grid'
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}>
        <DirectionCard />
        <EnableCard />
        <div style={{ gridColumn: '1 / -1' }}>
          <HotkeyCard />
        </div>
      </div>
    </>
  );
}
