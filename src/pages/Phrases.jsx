import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../components/StoreProvider';
import { useI18n } from '../i18n/I18nProvider';
import { Chip, Kbd, PageHead } from '../components/lg';
import { IPlus, ITrash } from '../icons';
import { defaultPhraseModifier, defaultPhraseModifierLabel } from '../constants/hotkeys';
import { invokeCommand, hasTauriRuntime } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';
import { toErrorMessage } from '../utils/error';

const MAX_PHRASE_COUNT = 20;
const MAX_PHRASE_LENGTH = 120;
const MODIFIER_CODE = defaultPhraseModifier();
const MODIFIER_LABEL = defaultPhraseModifierLabel();

const KEY_OPTIONS = [
  ...Array.from({ length: 10 }).map((_, i) => ({ code: `Digit${i}`, label: String(i) })),
  ...Array.from({ length: 26 }).map((_, i) => {
    const letter = String.fromCharCode(65 + i);
    return { code: `Key${letter}`, label: letter };
  }),
  ...Array.from({ length: 12 }).map((_, i) => ({ code: `F${i + 1}`, label: `F${i + 1}` })),
];

const normalizeMod = (value = '') => value.replace('Left', '').replace('Right', '');
const rowSignature = (keyCode) => `${MODIFIER_CODE}+${keyCode}`;
const hotkeySignature = (hotkey) => {
  if (!hotkey?.key) return '';
  const modifiers = [...(hotkey.modifiers || [])].map(normalizeMod).sort().join('+');
  return `${modifiers}+${hotkey.key}`;
};
const formatShortcutLabel = (keyCode) => {
  if (!keyCode) return `${MODIFIER_LABEL}+?`;
  if (keyCode.startsWith('Digit')) return `${MODIFIER_LABEL}+${keyCode.slice(5)}`;
  if (keyCode.startsWith('Key')) return `${MODIFIER_LABEL}+${keyCode.slice(3)}`;
  return `${MODIFIER_LABEL}+${keyCode}`;
};

const phraseHotkeyKeys = (keyCode) => {
  const option = KEY_OPTIONS.find((o) => o.code === keyCode);
  return [MODIFIER_LABEL, option?.label || '?'];
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
    const claimed = new Set();
    const mapped = source.map((item, index) => {
      const existing = item?.hotkey?.key;
      let keyCode = existing;
      if (!keyCode || claimed.has(keyCode)) {
        const fallback =
          KEY_OPTIONS.find((option) => !claimed.has(option.code))?.code ||
          `Digit${Math.min(index + 1, 9)}`;
        keyCode = fallback;
      }
      claimed.add(keyCode);
      return createRow(index + 1, item?.phrase || '', keyCode);
    });
    setRows(mapped);
  }, [settings?.phrases]);

  const translatorSignature = useMemo(
    () => hotkeySignature(settings?.trans_hotkey),
    [settings?.trans_hotkey],
  );

  const usedSignatures = useMemo(() => {
    const signatures = new Set();
    rows.forEach((row) => {
      if (row.keyCode) signatures.add(rowSignature(row.keyCode));
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
        .map((row, index) => ({ ...row, id: index + 1 })),
    );
  };

  const validateRows = () => {
    const signatures = new Set();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const text = row.phrase.trim();
      if (!text) return t('phrases.errors.rowEmpty', { index: index + 1 });
      if (text.length > MAX_PHRASE_LENGTH)
        return t('phrases.errors.rowTooLong', { index: index + 1, max: MAX_PHRASE_LENGTH });
      if (!row.keyCode) return t('phrases.errors.rowHotkeyMissing', { index: index + 1 });
      const signature = rowSignature(row.keyCode);
      if (signature === translatorSignature)
        return t('phrases.errors.conflictTranslator', { index: index + 1 });
      if (signatures.has(signature)) return t('phrases.errors.duplicateHotkey', { index: index + 1 });
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
        showSuccess(
          t(payload.length === 0 ? 'phrases.toasts.previewCleared' : 'phrases.toasts.previewSaved'),
        );
      }
    } catch (error) {
      showError(t('phrases.errors.saveFailed', { error: toErrorMessage(error) }));
    } finally {
      setSaving(false);
    }
  };

  const quotaPercent = Math.round((rows.length / MAX_PHRASE_COUNT) * 100);

  return (
    <>
      <PageHead
        title={t('phrases.pageTitle')}
        sub={t('phrases.pageSub', { max: MAX_PHRASE_COUNT })}
        right={
          <div className='home__row' style={{ gap: 10 }}>
            <div
              className='phrases__quota'
              style={{ '--p': quotaPercent }}
              title={t('phrases.pageQuotaChip', { used: rows.length, max: MAX_PHRASE_COUNT })}>
              <b>
                {rows.length}/{MAX_PHRASE_COUNT}
              </b>
            </div>
            <button type='button' className='lg-btn' onClick={saveRows} disabled={saving}>
              {saving ? t('phrases.saving') : t('phrases.save')}
            </button>
            <button type='button' className='lg-btn lg-btn--primary' onClick={addRow}>
              <IPlus aria-hidden='true' /> {t('phrases.add')}
            </button>
          </div>
        }
      />
      <div className='phrases__table lg-rise' style={{ '--i': 1 }}>
        <div className='phrases__head'>
          <span>{t('phrases.table.content')}</span>
          <span>{t('phrases.table.hotkey')}</span>
          <span style={{ textAlign: 'right' }}>{t('phrases.table.action')}</span>
        </div>

        {rows.length === 0 ? (
          <div className='phrases__empty'>
            <b>{t('phrases.empty.title')}</b>
            <span>{t('phrases.empty.summary')}</span>
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className='phrases__row'>
              <input
                className='lg-input lg-input--inline'
                value={row.phrase}
                onChange={(event) => patchRow(row.id, { phrase: event.target.value })}
                placeholder={t('phrases.contentPlaceholder')}
                maxLength={MAX_PHRASE_LENGTH}
                aria-label={t('phrases.table.content')}
              />
              <div className='phrases__hotkey'>
                <Kbd keys={phraseHotkeyKeys(row.keyCode)} size='sm' />
                <select
                  value={row.keyCode}
                  onChange={(event) => patchRow(row.id, { keyCode: event.target.value })}
                  className='phrases__keyselect'
                  aria-label={t('phrases.table.hotkey')}>
                  {KEY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className='phrases__actions'>
                <button
                  type='button'
                  className='lg-iconbtn lg-iconbtn--danger'
                  onClick={() => removeRow(row.id)}
                  aria-label={t('common.remove')}
                  title={t('common.remove')}>
                  <ITrash />
                </button>
              </div>
            </div>
          ))
        )}

        <div className='phrases__foot'>
          <Chip tone='brand' className='lg-chip--hud'>
            {t('phrases.footerHint')}
          </Chip>
          <span>{t('phrases.footerBody')}</span>
        </div>
      </div>
    </>
  );
}
