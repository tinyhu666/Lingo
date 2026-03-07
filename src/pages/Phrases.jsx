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

  return (
    <div className='flex h-full flex-col gap-6'>
      <motion.section className='dota-card tool-rise p-6' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <div className='tool-pill mb-3'>短语库</div>
            <h2 className='tool-page-title'>常用语工作区</h2>
            <p className='tool-body'>为高频沟通短句分配快捷入口，触发后可直接回填到当前输入框。</p>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <span className='tool-pill min-w-[76px] justify-center'>{rows.length} / {MAX_PHRASE_COUNT}</span>
            <button type='button' onClick={addRow} className='tool-btn min-w-[120px] whitespace-nowrap px-4'>
              新增常用语
            </button>
            <button
              type='button'
              onClick={saveRows}
              disabled={saving}
              className={`tool-btn-primary min-w-[104px] whitespace-nowrap px-4 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section className='dota-card tool-rise flex-1 p-4' initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <div className='h-full overflow-auto rounded-[20px] border border-[rgba(219,228,239,0.9)] bg-[rgba(255,255,255,0.62)]'>
          <table className='min-w-full border-separate border-spacing-0'>
            <thead className='sticky top-0 z-10 bg-[rgba(248,251,255,0.96)] backdrop-blur-xl'>
              <tr>
                <th className='px-5 py-4 text-left tool-caption w-[64px]'>#</th>
                <th className='px-4 py-4 text-left tool-caption'>常用语内容</th>
                <th className='px-4 py-4 text-left tool-caption w-[210px]'>快捷键</th>
                <th className='px-5 py-4 text-left tool-caption w-[92px]'>操作</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className='border-t border-[rgba(226,233,243,0.8)] hover:bg-[rgba(248,251,255,0.9)]'>
                  <td className='px-5 py-4 text-sm font-semibold text-zinc-500 align-top'>{row.id}</td>

                  <td className='px-4 py-4'>
                    <input
                      value={row.phrase}
                      onChange={(event) => patchRow(row.id, { phrase: event.target.value })}
                      className='tool-input'
                      placeholder='输入常用语内容'
                      maxLength={MAX_PHRASE_LENGTH}
                    />
                  </td>

                  <td className='px-4 py-4'>
                    <div className='flex items-center gap-2'>
                      <span className='tool-chip'>{MODIFIER_LABEL}</span>
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
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>
    </div>
  );
}
