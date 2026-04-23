import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../components/StoreProvider';
import PageHeader from '../components/PageHeader';
import PanelCard from '../components/PanelCard';
import StatusChip from '../components/StatusChip';
import KeycapGroup from '../components/KeycapGroup';
import { defaultPhraseModifier, defaultPhraseModifierLabel } from '../constants/hotkeys';
import { invokeCommand, hasTauriRuntime } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';
import { useI18n } from '../i18n/I18nProvider';

const MAX_PHRASE_COUNT = 20;
const MAX_PHRASE_LENGTH = 120;
const MODIFIER_CODE = defaultPhraseModifier();
const MODIFIER_LABEL = defaultPhraseModifierLabel();

const KEY_OPTIONS = [
  ...Array.from({ length: 10 }).map((_, index) => ({
    code: `Digit${index}`,
    label: String(index),
  })),
  ...Array.from({ length: 26 }).map((_, index) => {
    const letter = String.fromCharCode(65 + index);
    return {
      code: `Key${letter}`,
      label: letter,
    };
  }),
  ...Array.from({ length: 12 }).map((_, index) => ({
    code: `F${index + 1}`,
    label: `F${index + 1}`,
  })),
];

const normalizeModifier = (value = '') => value.replace('Left', '').replace('Right', '');
const rowSignature = (keyCode) => `${MODIFIER_CODE}+${keyCode}`;

const formatShortcutLabel = (keyCode) => {
  if (!keyCode) {
    return `${MODIFIER_LABEL}+?`;
  }
  if (keyCode.startsWith('Digit')) {
    return `${MODIFIER_LABEL}+${keyCode.slice(5)}`;
  }
  if (keyCode.startsWith('Key')) {
    return `${MODIFIER_LABEL}+${keyCode.slice(3)}`;
  }
  return `${MODIFIER_LABEL}+${keyCode}`;
};

const createRow = (id, phrase = '', keyCode = `Digit${Math.min(id, 9)}`) => ({
  id,
  phrase,
  keyCode,
});

export default function Phrases() {
  const { settings, updateSettings, syncSettings } = useStore();
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const source = settings?.phrases || [];
    if (source.length === 0) {
      setRows([]);
      return;
    }

    const mapped = source.map((item, index) =>
      createRow(index + 1, item?.phrase || '', item?.hotkey?.key || `Digit${Math.min(index + 1, 9)}`),
    );

    setRows(mapped);
  }, [settings?.phrases]);

  const translatorSignature = useMemo(() => {
    const hotkey = settings?.trans_hotkey;
    if (!hotkey?.key) {
      return '';
    }

    const modifiers = [...(hotkey.modifiers || [])]
      .map(normalizeModifier)
      .sort()
      .join('+');

    return `${modifiers}+${hotkey.key}`;
  }, [settings?.trans_hotkey]);

  const usedSignatures = useMemo(() => {
    const signatures = new Set();
    rows.forEach((row) => {
      if (row.keyCode) {
        signatures.add(rowSignature(row.keyCode));
      }
    });
    return signatures;
  }, [rows]);

  const patchRow = (id, patch) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    if (rows.length >= MAX_PHRASE_COUNT) {
      showError(t('phrases.errors.maxCount', { max: MAX_PHRASE_COUNT }));
      return;
    }

    const nextId = rows.length + 1;
    const available = KEY_OPTIONS.find((item) => !usedSignatures.has(rowSignature(item.code)));
    const fallback = `F${Math.min(nextId, 12)}`;
    const keyCode = available?.code || fallback;

    setRows((prev) => [...prev, createRow(nextId, '', keyCode)]);
  };

  const removeRow = (id) => {
    setRows((prev) =>
      prev
        .filter((row) => row.id !== id)
        .map((row, index) => ({
          ...row,
          id: index + 1,
        })),
    );
  };

  const validateRows = () => {
    const signatures = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const text = row.phrase.trim();

      if (!text) {
        return t('phrases.errors.rowEmpty', { index: index + 1 });
      }
      if (text.length > MAX_PHRASE_LENGTH) {
        return t('phrases.errors.rowTooLong', { index: index + 1, max: MAX_PHRASE_LENGTH });
      }
      if (!row.keyCode) {
        return t('phrases.errors.rowHotkeyMissing', { index: index + 1 });
      }

      const signature = rowSignature(row.keyCode);
      if (signature === translatorSignature) {
        return t('phrases.errors.conflictTranslator', { index: index + 1 });
      }
      if (signatures.has(signature)) {
        return t('phrases.errors.duplicateHotkey', { index: index + 1 });
      }

      signatures.add(signature);
    }

    return null;
  };

  const buildPayload = () =>
    rows.map((row, index) => ({
      id: index + 1,
      phrase: row.phrase.trim(),
      hotkey: {
        modifiers: [MODIFIER_CODE],
        key: row.keyCode,
        shortcut: formatShortcutLabel(row.keyCode),
      },
    }));

  const saveRows = async () => {
    const errorMessage = validateRows();
    if (errorMessage) {
      showError(errorMessage);
      return;
    }

    const payload = buildPayload();
    setSaving(true);

    try {
      if (hasTauriRuntime()) {
        const latest = await invokeCommand('update_phrases', { phrases: payload });
        await syncSettings(latest);
        showSuccess(t(payload.length === 0 ? 'phrases.toasts.cleared' : 'phrases.toasts.saved'));
      } else {
        await updateSettings({ phrases: payload });
        showSuccess(t(payload.length === 0 ? 'phrases.toasts.previewCleared' : 'phrases.toasts.previewSaved'));
      }
    } catch (error) {
      showError(t('phrases.errors.saveFailed', { error: toErrorMessage(error) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='phrases-page flex min-h-full flex-col gap-6'>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <PageHeader
          title={t('phrases.title')}
          description={t('phrases.summary')}
          actions={
            <>
              <StatusChip label={`${rows.length}/${MAX_PHRASE_COUNT}`} tone='neutral' />
              <button type='button' onClick={addRow} className='desktop-tight-button tool-btn min-w-[120px] whitespace-nowrap px-4'>
                {t('phrases.add')}
              </button>
              <button
                type='button'
                onClick={saveRows}
                disabled={saving}
                className={`desktop-tight-button tool-btn-primary min-w-[104px] whitespace-nowrap px-4 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {saving ? t('phrases.saving') : t('phrases.save')}
              </button>
            </>
          }
        />
      </motion.div>

      <motion.div className='flex-1' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <PanelCard className='phrases-panel tool-rise flex-1'>
          {rows.length === 0 ? (
            <div className='flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[rgba(201,214,234,0.96)] bg-[rgba(249,252,255,0.9)] px-6 py-10 text-center'>
              <div className='tool-card-title'>{t('phrases.empty.title')}</div>
              <p className='tool-body mt-3 max-w-[420px]'>{t('phrases.empty.summary')}</p>
              <button type='button' onClick={addRow} className='tool-btn mt-5 px-4'>
                {t('phrases.add')}
              </button>
            </div>
          ) : (
            <div className='phrases-table-shell'>
              <table className='phrases-table min-w-full border-separate border-spacing-0'>
                <thead className='phrases-table__head sticky top-0 z-10'>
                  <tr>
                    <th className='px-5 py-4 text-left tool-caption w-[64px]'>{t('phrases.table.index')}</th>
                    <th className='px-4 py-4 text-left tool-caption'>{t('phrases.table.content')}</th>
                    <th className='px-4 py-4 text-left tool-caption w-[210px]'>{t('phrases.table.hotkey')}</th>
                    <th className='px-5 py-4 text-left tool-caption w-[92px]'>{t('phrases.table.action')}</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className='phrases-table__row border-t border-[rgba(226,233,243,0.8)]'>
                      <td className='px-5 py-4 align-top text-sm font-semibold text-zinc-500'>{row.id}</td>

                      <td className='px-4 py-4'>
                        <input
                          value={row.phrase}
                          onChange={(event) => patchRow(row.id, { phrase: event.target.value })}
                          className='tool-input'
                          placeholder={t('phrases.contentPlaceholder')}
                          maxLength={MAX_PHRASE_LENGTH}
                        />
                      </td>

                      <td className='px-4 py-4'>
                        <div className='phrases-hotkey-editor'>
                          <KeycapGroup keys={[MODIFIER_LABEL]} size='sm' />
                          <select
                            value={row.keyCode}
                            onChange={(event) => patchRow(row.id, { keyCode: event.target.value })}
                            className='tool-input'>
                            {KEY_OPTIONS.map((option) => (
                              <option key={option.code} value={option.code}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className='px-5 py-4 align-top'>
                        <button
                          type='button'
                          onClick={() => removeRow(row.id)}
                          className='tool-btn tool-btn-danger min-w-[72px] px-3 text-sm'>
                          {t('common.remove')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>
      </motion.div>
    </div>
  );
}
