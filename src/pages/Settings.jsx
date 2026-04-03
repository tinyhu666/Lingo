import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Dock, Globe, KeyboardAlt, Server, Sparkles, Spinner } from '../icons';
import { useStore } from '../components/StoreProvider';
import { LANGUAGE_OPTIONS, getLanguageMeta } from '../constants/languages';
import { DEFAULT_GAME_SCENE, getGameSceneLabel } from '../constants/gameScenes';
import {
  buildHotkeyFromKeyCodes,
  defaultIncomingChatHotkeyLabel,
  formatMainKeyLabel,
  formatModifierLabel,
  isModifierKeyCode,
  normalizeModifier,
} from '../constants/hotkeys';
import { useI18n } from '../i18n/I18nProvider';
import { hasTauriRuntime, invokeCommand } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

const formatPreview = (codes) =>
  codes
    .map((code) => (isModifierKeyCode(code) ? formatModifierLabel(normalizeModifier(code)) : formatMainKeyLabel(code)))
    .join(' + ');

const localeBucket = (locale = 'zh-CN') => {
  const raw = String(locale || '').toLowerCase();
  if (raw.startsWith('en')) {
    return 'en';
  }
  if (raw.startsWith('ru')) {
    return 'ru';
  }
  return 'zh';
};

function IncomingHotkeyRecorder({ settings, updateSettings, syncSettings, copy }) {
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
    if (committingRef.current) {
      return;
    }

    committingRef.current = true;
    const keys = [...codesRef.current];
    if (keys.length === 0) {
      stopRecording();
      return;
    }

    try {
      if (hasTauriRuntime()) {
        const latest = await invokeCommand('update_incoming_chat_shortcut', { keys });
        await syncSettings(latest);
        showSuccess(copy.hotkeySetSuccess);
      } else {
        const hotkey = buildHotkeyFromKeyCodes(keys);
        await updateSettings({ incoming_chat_hotkey: hotkey });
        showSuccess(copy.hotkeyPreviewSuccess);
      }
    } catch (error) {
      showError(copy.hotkeySetFailed(toErrorMessage(error)));
    } finally {
      stopRecording();
    }
  }, [copy, stopRecording, syncSettings, updateSettings]);

  const handleKeyDown = useCallback(
    (event) => {
      if (!recording) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        stopRecording();
        return;
      }

      if (!event.code || codesRef.current.includes(event.code)) {
        return;
      }

      codesRef.current = [...codesRef.current, event.code];
      setCapturedCodes(codesRef.current);
    },
    [recording, stopRecording],
  );

  const handleKeyUp = useCallback(
    (event) => {
      if (!recording) {
        return;
      }

      if (!codesRef.current.some((code) => !isModifierKeyCode(code))) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void commitHotkey();
    },
    [commitHotkey, recording],
  );

  useEffect(() => {
    if (!recording) {
      return undefined;
    }

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [handleKeyDown, handleKeyUp, recording]);

  const hotkeyDisplay = useMemo(() => {
    if (recording && capturedCodes.length === 0) {
      return <Spinner className='h-5 w-5 animate-spin text-zinc-400' />;
    }

    if (recording) {
      return formatPreview(capturedCodes);
    }

    return settings?.incoming_chat_hotkey?.shortcut || defaultIncomingChatHotkeyLabel();
  }, [capturedCodes, recording, settings?.incoming_chat_hotkey?.shortcut]);

  return (
    <button
      type='button'
      onClick={() => {
        if (recording) {
          stopRecording();
          return;
        }
        setCapturedCodes([]);
        codesRef.current = [];
        setRecording(true);
      }}
      className='tool-subcard flex min-h-[112px] w-full flex-col items-start justify-between gap-4 p-4 text-left transition-all duration-200 hover:border-[rgba(129,163,255,0.58)]'>
      <div className='flex items-center gap-3'>
        <span className='workspace-header__icon h-10 w-10 min-w-[40px]'>
          <KeyboardAlt className='h-5 w-5 stroke-current' />
        </span>
        <div>
          <div className='tool-card-title'>{copy.hotkeyTitle}</div>
          <div className='tool-body mt-1'>{recording ? copy.hotkeyRecording : copy.hotkeyHint}</div>
        </div>
      </div>
      <div className='tool-chip min-w-[120px] justify-center self-stretch text-center sm:self-start'>
        {typeof hotkeyDisplay === 'string' ? hotkeyDisplay : hotkeyDisplay}
      </div>
    </button>
  );
}

export default function Settings() {
  const { settings, updateSettings, syncSettings } = useStore();
  const { locale, t } = useI18n();
  const [actionLoading, setActionLoading] = useState({
    translate: false,
    calibrate: false,
    clear: false,
  });
  const bucket = localeBucket(locale);

  const copy = useMemo(() => {
    const variants = {
      zh: {
        incomingTitle: '队友发言翻译',
        incomingSummary: '自动模式会在聊天区出现新消息并稳定后自动翻译；手动模式则通过热键拉起圈选，只翻译本次选中的聊天内容。',
        enabledLabel: '启用队友翻译',
        modeLabel: '翻译模式',
        autoMode: '自动模式',
        manualMode: '手动圈选',
        targetLanguage: '译文目标语言',
        overlayLabel: '显示悬浮译文',
        modeHintAuto: '自动监听 Dota2 聊天区域，检测到队友发言稳定后开始翻译。',
        modeHintManual: '按手动热键后圈选聊天区域，只翻译本次选中的内容。',
        hotkeyTitle: '手动模式快捷键',
        hotkeyHint: '点击录制一个组合键，用来拉起圈选翻译。',
        hotkeyRecording: '按下组合键并松开任意键完成设置。',
        hotkeySetSuccess: '队友翻译快捷键设置成功',
        hotkeyPreviewSuccess: '预览模式：手动翻译快捷键已更新',
        hotkeySetFailed: (error) => `队友翻译快捷键设置失败: ${error}`,
        translateNow: '立即框选翻译',
        calibrate: '校准聊天区域',
        clearCalibration: '清除本地校准',
        clearCalibrationSuccess: '已清除本地聊天区域校准',
        actionFailed: (error) => `操作失败: ${error}`,
        roiStatus: '聊天区域状态',
        roiSaved: '已使用本地校准范围',
        roiDefault: '当前使用服务端默认范围',
        desktopOnly: '该操作仅支持桌面客户端',
      },
      en: {
        incomingTitle: 'Teammate Chat Translation',
        incomingSummary:
          'Auto mode watches the Dota 2 chat area and starts translation after a new message stabilizes. Manual mode opens a drag-to-select overlay and translates only the selected chat snapshot.',
        enabledLabel: 'Enable teammate translation',
        modeLabel: 'Mode',
        autoMode: 'Auto',
        manualMode: 'Manual selection',
        targetLanguage: 'Target language',
        overlayLabel: 'Show overlay subtitles',
        modeHintAuto:
          'Continuously monitors the Dota 2 chat area and starts translation once a teammate message stops changing.',
        modeHintManual:
          'Press the manual hotkey to draw a selection box and translate only that captured region.',
        hotkeyTitle: 'Manual mode hotkey',
        hotkeyHint: 'Click to record a shortcut that opens the selection overlay.',
        hotkeyRecording: 'Press a combo and release any key to save it.',
        hotkeySetSuccess: 'Incoming translation hotkey updated.',
        hotkeyPreviewSuccess: 'Preview mode: incoming translation hotkey updated.',
        hotkeySetFailed: (error) => `Failed to update incoming hotkey: ${error}`,
        translateNow: 'Select and translate now',
        calibrate: 'Calibrate chat region',
        clearCalibration: 'Clear local calibration',
        clearCalibrationSuccess: 'Local chat region calibration cleared.',
        actionFailed: (error) => `Action failed: ${error}`,
        roiStatus: 'Chat region source',
        roiSaved: 'Using local calibrated region',
        roiDefault: 'Using server default region',
        desktopOnly: 'This action is only available in the desktop app',
      },
      ru: {
        incomingTitle: 'Перевод реплик союзников',
        incomingSummary:
          'Автоматический режим отслеживает чат Dota 2 и запускает перевод, когда новая реплика стабилизируется. Ручной режим открывает оверлей для выделения области и переводит только текущий снимок.',
        enabledLabel: 'Включить перевод союзников',
        modeLabel: 'Режим',
        autoMode: 'Авто',
        manualMode: 'Ручное выделение',
        targetLanguage: 'Язык перевода',
        overlayLabel: 'Показывать оверлей',
        modeHintAuto:
          'Следит за областью чата Dota 2 и начинает перевод, когда новая реплика перестает меняться.',
        modeHintManual:
          'Нажмите хоткей ручного режима, выделите область и переводите только текущий фрагмент чата.',
        hotkeyTitle: 'Хоткей ручного режима',
        hotkeyHint: 'Нажмите, чтобы записать сочетание для открытия выделения.',
        hotkeyRecording: 'Нажмите сочетание и отпустите любую клавишу для сохранения.',
        hotkeySetSuccess: 'Хоткей перевода союзников обновлен.',
        hotkeyPreviewSuccess: 'Режим предпросмотра: хоткей обновлен.',
        hotkeySetFailed: (error) => `Не удалось обновить хоткей: ${error}`,
        translateNow: 'Выделить и перевести',
        calibrate: 'Калибровать область чата',
        clearCalibration: 'Сбросить локальную калибровку',
        clearCalibrationSuccess: 'Локальная калибровка области чата очищена.',
        actionFailed: (error) => `Ошибка действия: ${error}`,
        roiStatus: 'Источник области чата',
        roiSaved: 'Используется локальная калибровка',
        roiDefault: 'Используется серверный диапазон по умолчанию',
        desktopOnly: 'Действие доступно только в desktop-клиенте',
      },
    };

    return variants[bucket] || variants.zh;
  }, [bucket]);

  const serviceStatus = useMemo(() => {
    if (!settings) {
      return {
        label: t('settings.loading'),
        tone: 'text-zinc-600',
        hint: t('settings.loadingHint'),
      };
    }

    if (settings.app_enabled === false) {
      return {
        label: t('settings.paused'),
        tone: 'text-amber-600',
        hint: t('settings.pausedHint'),
      };
    }

    return {
      label: t('settings.enabled'),
      tone: 'text-emerald-600',
      hint: t('settings.enabledHint'),
    };
  }, [settings, t]);

  const from = settings?.translation_from || 'zh';
  const to = settings?.translation_to || 'en';
  const scene = getGameSceneLabel(settings?.game_scene || DEFAULT_GAME_SCENE, locale);
  const modeKey = `translate.mode.${settings?.translation_mode || 'auto'}.title`;
  const modeLabel = t(modeKey) === modeKey ? t('translate.mode.auto.title') : t(modeKey);
  const incomingMode = settings?.incoming_chat_mode || 'auto';
  const incomingEnabled = Boolean(settings?.incoming_chat_enabled);
  const overlayEnabled = settings?.incoming_chat_overlay_enabled !== false;
  const roiSaved = Boolean(settings?.incoming_chat_roi_override);

  const patchIncomingSettings = useCallback(
    async (patch) => {
      try {
        await updateSettings(patch);
      } catch (error) {
        showError(copy.actionFailed(toErrorMessage(error)));
      }
    },
    [copy, updateSettings],
  );

  const runIncomingAction = useCallback(
    async (type) => {
      if (!hasTauriRuntime()) {
        showError(copy.desktopOnly);
        return;
      }

      const commandMap = {
        translate: 'start_incoming_chat_selection',
        calibrate: 'start_incoming_chat_roi_calibration',
        clear: 'clear_incoming_chat_roi_override',
      };

      const command = commandMap[type];
      if (!command) {
        return;
      }

      setActionLoading((current) => ({ ...current, [type]: true }));
      try {
        const response = await invokeCommand(command);
        if (type === 'clear') {
          await syncSettings(response);
          showSuccess(copy.clearCalibrationSuccess);
        }
      } catch (error) {
        showError(copy.actionFailed(toErrorMessage(error)));
      } finally {
        setActionLoading((current) => ({ ...current, [type]: false }));
      }
    },
    [copy, syncSettings],
  );

  return (
    <div className='flex h-full flex-col gap-6'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className='flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0'>
            <div className='tool-pill mb-3'>{t('settings.overviewBadge')}</div>
            <h2 className='tool-page-title'>{t('settings.title')}</h2>
            <p className='tool-body'>{t('settings.summary')}</p>
          </div>
          <div className='tool-subcard w-full min-w-0 px-4 py-3 sm:w-auto sm:min-w-[132px] sm:shrink-0'>
            <div className='tool-caption'>{t('settings.statusCard')}</div>
            <div className={`tool-card-title mt-2 ${serviceStatus.tone}`}>{serviceStatus.label}</div>
          </div>
        </div>
      </motion.section>

      <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
        <motion.section className='dota-card tool-rise min-w-0 p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div className='mb-5 flex items-center gap-3'>
            <Server className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>{t('settings.section.status')}</h3>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.statusCard')}</div>
              <div className={`tool-card-title mt-2 ${serviceStatus.tone}`}>{serviceStatus.label}</div>
              <p className='tool-body mt-2'>{serviceStatus.hint}</p>
            </div>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.defaultLanguage')}</div>
              <div className='tool-card-title mt-2 text-zinc-900'>
                {getLanguageMeta(from, locale).label} → {getLanguageMeta(to, locale).label}
              </div>
              <p className='tool-body mt-2'>{t('settings.defaultLanguageHint')}</p>
            </div>
          </div>
        </motion.section>

        <motion.section className='dota-card tool-rise min-w-0 p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className='mb-5 flex items-center gap-3'>
            <Cpu className='h-5 w-5 stroke-zinc-500' />
            <h3 className='tool-card-title'>{t('settings.section.strategy')}</h3>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.strategy.scene')}</div>
              <div className='tool-card-title mt-2 text-zinc-900'>{scene}</div>
            </div>
            <div className='tool-subcard min-w-0 p-4'>
              <div className='tool-caption'>{t('settings.strategy.tone')}</div>
              <div className='tool-card-title mt-2 text-zinc-900'>{modeLabel}</div>
            </div>
          </div>

          <div className='tool-subcard mt-4 p-4'>
            <div className='flex items-center gap-2'>
              <Sparkles className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('settings.strategy.hintTitle')}</span>
            </div>
            <p className='tool-body mt-2'>{t('settings.strategy.hintBody')}</p>
          </div>
        </motion.section>
      </div>

      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0'>
            <div className='mb-3 flex items-center gap-3'>
              <Dock className='h-5 w-5 stroke-zinc-500' />
              <h3 className='tool-card-title'>{copy.incomingTitle}</h3>
            </div>
            <p className='tool-body'>{copy.incomingSummary}</p>
          </div>
          <button
            type='button'
            onClick={() => {
              void patchIncomingSettings({ incoming_chat_enabled: !incomingEnabled });
            }}
            className={`tool-chip min-w-[144px] justify-center ${incomingEnabled ? 'workspace-pill--success' : ''}`}>
            {copy.enabledLabel}: {incomingEnabled ? t('common.enabled') : t('common.paused')}
          </button>
        </div>

        <div className='mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <div className='tool-subcard p-4'>
            <div className='tool-caption'>{copy.modeLabel}</div>
            <div className='mt-3 flex flex-wrap gap-2'>
              {[
                { id: 'auto', label: copy.autoMode },
                { id: 'manual', label: copy.manualMode },
              ].map((option) => (
                <button
                  key={option.id}
                  type='button'
                  onClick={() => {
                    void patchIncomingSettings({ incoming_chat_mode: option.id });
                  }}
                  className={`tool-btn px-4 ${incomingMode === option.id ? 'tool-btn-primary' : ''}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <p className='tool-body mt-3'>
              {incomingMode === 'manual' ? copy.modeHintManual : copy.modeHintAuto}
            </p>
          </div>

          <div className='tool-subcard p-4'>
            <div className='tool-caption'>{copy.targetLanguage}</div>
            <div className='mt-3 flex flex-col gap-3 sm:flex-row sm:items-center'>
              <select
                value={settings?.incoming_chat_target_language || settings?.translation_from || 'zh'}
                onChange={(event) => {
                  void patchIncomingSettings({ incoming_chat_target_language: event.target.value });
                }}
                className='tool-input'>
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.id} value={language.id}>
                    {getLanguageMeta(language.id, locale).label}
                  </option>
                ))}
              </select>
              <button
                type='button'
                onClick={() => {
                  void patchIncomingSettings({ incoming_chat_overlay_enabled: !overlayEnabled });
                }}
                className={`tool-chip min-w-[156px] justify-center ${overlayEnabled ? 'workspace-pill--success' : ''}`}>
                {copy.overlayLabel}: {overlayEnabled ? t('common.enabled') : t('common.paused')}
              </button>
            </div>
          </div>

          <div className='tool-subcard p-4'>
            <div className='tool-caption'>{copy.roiStatus}</div>
            <div className='tool-card-title mt-2 text-zinc-900'>{roiSaved ? copy.roiSaved : copy.roiDefault}</div>
            <p className='tool-body mt-2'>{t('settings.serviceSummary')}</p>
          </div>

          <div className='tool-subcard p-4'>
            <div className='mb-3 flex items-center gap-2'>
              <Globe className='h-4 w-4 stroke-zinc-500' />
              <span className='tool-caption'>{t('settings.section.service')}</span>
            </div>
            <p className='tool-body'>{t('settings.strategy.hintBody')}</p>
          </div>
        </div>

        <div className='mt-4'>
          <IncomingHotkeyRecorder
            settings={settings}
            updateSettings={updateSettings}
            syncSettings={syncSettings}
            copy={copy}
          />
        </div>

        <div className='mt-6 flex flex-wrap gap-3'>
          <button
            type='button'
            onClick={() => {
              void runIncomingAction('translate');
            }}
            disabled={actionLoading.translate}
            className={`tool-btn-primary px-4 ${actionLoading.translate ? 'cursor-not-allowed opacity-70' : ''}`}>
            {actionLoading.translate ? t('common.saving') : copy.translateNow}
          </button>
          <button
            type='button'
            onClick={() => {
              void runIncomingAction('calibrate');
            }}
            disabled={actionLoading.calibrate}
            className={`tool-btn px-4 ${actionLoading.calibrate ? 'cursor-not-allowed opacity-70' : ''}`}>
            {actionLoading.calibrate ? t('common.saving') : copy.calibrate}
          </button>
          <button
            type='button'
            onClick={() => {
              void runIncomingAction('clear');
            }}
            disabled={actionLoading.clear || !roiSaved}
            className={`tool-btn tool-btn-danger px-4 ${actionLoading.clear || !roiSaved ? 'cursor-not-allowed opacity-60' : ''}`}>
            {actionLoading.clear ? t('common.saving') : copy.clearCalibration}
          </button>
        </div>
      </motion.section>
    </div>
  );
}
