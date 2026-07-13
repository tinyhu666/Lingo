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
  const incomingToggleSignature = useMemo(
    () => hotkeySignature(settings?.incoming_toggle_hotkey),
    [settings?.incoming_toggle_hotkey],
  );
  const incomingClickThroughSignature = useMemo(
    () => hotkeySignature(settings?.incoming_click_through_hotkey),
    [settings?.incoming_click_through_hotkey],
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
      if (signature === incomingToggleSignature)
        return t('phrases.errors.conflictIncomingToggle', { index: index + 1 });
      if (signature === incomingClickThroughSignature)
        return t('phrases.errors.conflictClickThrough', { index: index + 1 });
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

  const GRID_COLS = '1.6fr 1fr 0.6fr 44px';

  return (
    <>
      <PageHead
        title={t('phrases.pageTitle')}
        sub={t('phrases.pageSub', { max: MAX_PHRASE_COUNT })}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Chip dot tone='info'>
              {t('phrases.pageQuotaChip', { used: rows.length, max: MAX_PHRASE_COUNT })}
            </Chip>
            <button
              type='button'
              className='lg-btn lg-btn--sm'
              onClick={saveRows}
              disabled={saving}>
              {saving ? t('phrases.saving') : t('phrases.save')}
            </button>
            <button
              type='button'
              className='lg-btn lg-btn--sm lg-btn--primary'
              onClick={addRow}>
              <IPlus /> {t('phrases.add')}
            </button>
          </div>
        }
      />
      <div className='lg-card' style={{ padding: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: GRID_COLS,
            gap: 0,
            padding: '10px 16px',
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--lg-ink-3)',
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            borderBottom: '1px solid var(--lg-line-3)',
            background: 'var(--lg-surf-2)',
          }}>
          <span>{t('phrases.table.content')}</span>
          <span>{t('phrases.table.hotkey')}</span>
          <span>{t('phrases.table.usage')}</span>
          <span style={{ textAlign: 'right' }}>{t('phrases.table.action')}</span>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--lg-ink-3)',
              fontSize: 13,
            }}>
            <div style={{ fontWeight: 700, color: 'var(--lg-ink-1)', marginBottom: 6 }}>
              {t('phrases.empty.title')}
            </div>
            <div style={{ fontSize: 12 }}>{t('phrases.empty.summary')}</div>
          </div>
        ) : (
          rows.map((row, i) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID_COLS,
                alignItems: 'center',
                gap: 0,
                padding: '8px 16px',
                borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--lg-line-3)',
              }}>
              <input
                className='lg-input'
                value={row.phrase}
                onChange={(event) => patchRow(row.id, { phrase: event.target.value })}
                placeholder={t('phrases.contentPlaceholder')}
                maxLength={MAX_PHRASE_LENGTH}
                style={{ width: '92%' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Kbd keys={phraseHotkeyKeys(row.keyCode)} />
                <select
                  value={row.keyCode}
                  onChange={(event) => patchRow(row.id, { keyCode: event.target.value })}
                  className='lg-input'
                  style={{ width: 64, padding: '0 6px', height: 26 }}>
                  {KEY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <span style={{ fontSize: 12, color: 'var(--lg-ink-2)', fontFamily: 'var(--lg-mono)' }}>
                —
              </span>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type='button'
                  className='lg-btn lg-btn--sm lg-btn--ghost'
                  style={{ color: 'var(--lg-danger-ink)' }}
                  onClick={() => removeRow(row.id)}
                  aria-label={t('common.remove')}>
                  <ITrash />
                </button>
              </div>
            </div>
          ))
        )}

        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--lg-surf-2)',
            borderTop: '1px solid var(--lg-line-3)',
          }}>
          <span style={{ fontSize: 11, color: 'var(--lg-ink-3)' }}>{t('phrases.footerHint')}</span>
          <span style={{ fontSize: 12, color: 'var(--lg-ink-2)' }}>{t('phrases.footerBody')}</span>
        </div>
      </div>
    </>
  );
}
