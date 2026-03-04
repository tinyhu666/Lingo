import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../components/StoreProvider';
import { defaultPhraseModifier, defaultPhraseModifierLabel } from '../constants/hotkeys';
import { invokeCommand, hasTauriRuntime } from '../services/tauriRuntime';
import { showError, showSuccess } from '../utils/toast';

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
  const { settings, updateSettings, replaceSettings } = useStore();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const source = settings?.phrases || [];
    if (source.length === 0) {
      setRows([createRow(1)]);
      return;
    }

    const mapped = source.map((item, index) =>
      createRow(
        index + 1,
        item?.phrase || '',
        item?.hotkey?.key || `Digit${Math.min(index + 1, 9)}`,
      ),
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

  const signatureCounts = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (!row.keyCode) {
        return;
      }
      const signature = rowSignature(row.keyCode);
      map.set(signature, (map.get(signature) || 0) + 1);
    });
    return map;
  }, [rows]);

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
      showError(`常用语最多 ${MAX_PHRASE_COUNT} 条`);
      return;
    }

    const nextId = rows.length + 1;
    const available = KEY_OPTIONS.find((item) => !usedSignatures.has(rowSignature(item.code)));
    const fallback = `F${Math.min(nextId, 12)}`;
    const keyCode = available?.code || fallback;

    setRows((prev) => [...prev, createRow(nextId, '', keyCode)]);
  };

  const removeRow = (id) => {
    if (rows.length <= 1) {
      showError('请至少保留一条常用语');
      return;
    }

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
        return `第 ${index + 1} 条常用语为空`;
      }
      if (text.length > MAX_PHRASE_LENGTH) {
        return `第 ${index + 1} 条常用语超过 ${MAX_PHRASE_LENGTH} 字`;
      }
      if (!row.keyCode) {
        return `第 ${index + 1} 条快捷键未设置`;
      }

      const signature = rowSignature(row.keyCode);
      if (signature === translatorSignature) {
        return `第 ${index + 1} 条与翻译快捷键冲突`;
      }
      if (signatures.has(signature)) {
        return `第 ${index + 1} 条快捷键重复`;
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
        await invokeCommand('update_phrases', { phrases: payload });
        const latest = await invokeCommand('get_settings');
        await replaceSettings(latest);
        showSuccess('常用语已保存并更新快捷键');
      } else {
        await updateSettings({ phrases: payload });
        showSuccess('预览模式：常用语已保存到本地');
      }
    } catch (error) {
      showError(`保存失败: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const validationMessage = validateRows();

  return (
    <div className='h-full flex flex-col gap-5 ui-animate-in'>
      <motion.section
        className='ui-card ui-card-glass rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <div className='flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between'>
          <div>
            <h1 className='ui-page-title'>常用语</h1>
            <p className='ui-body mt-2'>
              使用固定前缀快捷键配置战术短句。新增、删除、保存后会立即同步到客户端配置。
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <span className='ui-chip'>共 {rows.length} / {MAX_PHRASE_COUNT}</span>
            <button type='button' onClick={addRow} className='ui-btn'>
              新增常用语
            </button>
            <button
              type='button'
              onClick={saveRows}
              disabled={saving}
              className={`ui-btn-primary ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        <div className='mt-4'>
          {validationMessage ? (
            <div className='ui-danger'>{validationMessage}</div>
          ) : (
            <div className='ui-soft-card px-3 py-2 ui-body'>校验通过，可直接保存。</div>
          )}
        </div>
      </motion.section>

      <motion.section
        className='ui-card rounded-2xl p-4 flex-1 min-h-0 overflow-auto'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}>
        <div className='space-y-3'>
          {rows.map((row) => {
            const signature = rowSignature(row.keyCode);
            const duplicate = (signatureCounts.get(signature) || 0) > 1;
            const translatorConflict = signature === translatorSignature;
            const hasConflict = duplicate || translatorConflict;

            return (
              <article key={row.id} className='ui-soft-card rounded-xl p-4 space-y-3'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center gap-2'>
                    <span className='ui-chip'>#{row.id}</span>
                    <span className='ui-caption'>快捷键：{formatShortcutLabel(row.keyCode)}</span>
                  </div>

                  <button
                    type='button'
                    onClick={() => removeRow(row.id)}
                    className='ui-btn !h-9 !px-3 !text-xs !border-[#6f3b45] !text-[#ffc2c8] !bg-[#4a2228] hover:!bg-[#5b2a31]'>
                    删除
                  </button>
                </div>

                <div className='grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px]'>
                  <input
                    value={row.phrase}
                    onChange={(event) => patchRow(row.id, { phrase: event.target.value })}
                    className='ui-control'
                    placeholder='输入常用语内容'
                    maxLength={MAX_PHRASE_LENGTH}
                  />

                  <div className='flex items-center gap-2'>
                    <span className='ui-chip shrink-0'>{MODIFIER_LABEL}</span>
                    <select
                      value={row.keyCode}
                      onChange={(event) => patchRow(row.id, { keyCode: event.target.value })}
                      className='ui-control'>
                      {KEY_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={`ui-caption ${hasConflict ? '!text-[#ff9aa5]' : ''}`}>
                  {translatorConflict
                    ? '与翻译快捷键冲突，请更换键位。'
                    : duplicate
                      ? '存在重复快捷键，请调整。'
                      : `长度 ${row.phrase.trim().length}/${MAX_PHRASE_LENGTH}，状态正常。`}
                </div>
              </article>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}
