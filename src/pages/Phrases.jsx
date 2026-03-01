import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../components/StoreProvider';
import { showError, showSuccess } from '../utils/toast';

const isMac =
  typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
const hasTauriInvoke = () =>
  typeof window !== 'undefined' &&
  typeof window.__TAURI_INTERNALS__ !== 'undefined' &&
  typeof window.__TAURI_INTERNALS__.invoke === 'function';

const DEFAULT_MODIFIER = isMac ? 'Meta' : 'Alt';
const MODIFIER_LABEL = isMac ? '⌘' : 'Alt';

const KEY_OPTIONS = [
  ...Array.from({ length: 10 }).map((_, i) => ({ code: `Digit${i}`, label: `${i}` })),
  ...Array.from({ length: 26 }).map((_, i) => ({
    code: `Key${String.fromCharCode(65 + i)}`,
    label: String.fromCharCode(65 + i),
  })),
  ...Array.from({ length: 12 }).map((_, i) => ({ code: `F${i + 1}`, label: `F${i + 1}` })),
];

const formatHotkeyLabel = (keyCode) => {
  if (!keyCode) return `${MODIFIER_LABEL}+?`;
  if (keyCode.startsWith('Digit')) return `${MODIFIER_LABEL}+${keyCode.slice(5)}`;
  if (keyCode.startsWith('Key')) return `${MODIFIER_LABEL}+${keyCode.slice(3)}`;
  return `${MODIFIER_LABEL}+${keyCode}`;
};

const makeRow = (id, phrase = '', keyCode = `Digit${Math.min(id, 9)}`) => ({
  id,
  phrase,
  keyCode,
});

export default function Phrases() {
  const { settings, updateSettings } = useStore();
  const [rows, setRows] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const source = settings?.phrases || [];
    if (source.length === 0) {
      setRows([makeRow(1)]);
      return;
    }

    setRows(
      source.map((item, idx) =>
        makeRow(
          idx + 1,
          item.phrase || '',
          item?.hotkey?.key || `Digit${Math.min(idx + 1, 9)}`,
        ),
      ),
    );
  }, [settings?.phrases]);

  const translatorSignature = useMemo(() => {
    const trans = settings?.trans_hotkey;
    if (!trans?.key) return '';
    const mods = [...(trans.modifiers || [])]
      .map((m) => m.replace('Left', '').replace('Right', ''))
      .sort()
      .join('+');
    return `${mods}+${trans.key}`;
  }, [settings?.trans_hotkey]);

  const usedSignatures = useMemo(() => {
    const signatures = new Set();
    rows.forEach((row) => {
      if (row.keyCode) {
        signatures.add(`${DEFAULT_MODIFIER}+${row.keyCode}`);
      }
    });
    return signatures;
  }, [rows]);

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    if (rows.length >= 20) {
      showError('常用语最多 20 条');
      return;
    }

    const nextId = rows.length + 1;
    const fallback = KEY_OPTIONS.find((opt) => !usedSignatures.has(`${DEFAULT_MODIFIER}+${opt.code}`));
    const keyCode = fallback?.code || `F${Math.min(nextId, 12)}`;
    setRows((prev) => [...prev, makeRow(nextId, '', keyCode)]);
  };

  const removeRow = (id) => {
    if (rows.length <= 1) {
      showError('请至少保留一条常用语');
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== id).map((row, idx) => ({ ...row, id: idx + 1 })));
  };

  const validateRows = () => {
    const sigSet = new Set();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const text = row.phrase.trim();
      if (!text) {
        return `第 ${i + 1} 条常用语为空`;
      }
      if (text.length > 120) {
        return `第 ${i + 1} 条常用语超过 120 字`;
      }
      if (!row.keyCode) {
        return `第 ${i + 1} 条快捷键未设置`;
      }

      const sig = `${DEFAULT_MODIFIER}+${row.keyCode}`;
      if (sig === translatorSignature) {
        return `第 ${i + 1} 条与翻译快捷键冲突`;
      }
      if (sigSet.has(sig)) {
        return `第 ${i + 1} 条快捷键重复`;
      }
      sigSet.add(sig);
    }

    return null;
  };

  const savePhrases = async () => {
    const error = validateRows();
    if (error) {
      showError(error);
      return;
    }

    const payload = rows.map((row, idx) => ({
      id: idx + 1,
      phrase: row.phrase.trim(),
      hotkey: {
        modifiers: [DEFAULT_MODIFIER],
        key: row.keyCode,
        shortcut: formatHotkeyLabel(row.keyCode),
      },
    }));

    setIsSaving(true);
    try {
      if (hasTauriInvoke()) {
        const saved = await invoke('update_phrases', { phrases: payload });
        await updateSettings({ phrases: saved });
        showSuccess('常用语已保存并更新快捷键');
      } else {
        await updateSettings({ phrases: payload });
        showSuccess('预览模式：常用语已保存到本地');
      }
    } catch (err) {
      showError(`保存失败: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='h-full flex flex-col gap-6'>
      <motion.div
        className='dota-card w-full rounded-2xl p-6'
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold text-zinc-900'>常用语</h1>
            <p className='mt-2 text-sm text-zinc-500'>
              可新增、修改、删除常用语。快捷键固定使用 {MODIFIER_LABEL} + 键位，避免误触。
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <button onClick={addRow} className='tool-btn px-3 py-2 text-sm'>
              新增常用语
            </button>
            <button
              onClick={savePhrases}
              disabled={isSaving}
              className={`tool-btn-primary px-4 py-2 text-sm ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        <div className='mt-5 overflow-auto'>
          <table className='min-w-full'>
            <thead>
              <tr className='border-b border-zinc-200'>
                <th className='py-3 pr-2 text-left text-sm font-semibold text-zinc-500 w-[64px]'>#</th>
                <th className='py-3 px-2 text-left text-sm font-semibold text-zinc-500'>常用语内容</th>
                <th className='py-3 px-2 text-left text-sm font-semibold text-zinc-500 w-[190px]'>快捷键</th>
                <th className='py-3 pl-2 text-left text-sm font-semibold text-zinc-500 w-[90px]'>操作</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-zinc-200'>
              {rows.map((row) => (
                <tr key={row.id} className='hover:bg-zinc-50/80'>
                  <td className='py-3 pr-2 text-sm text-zinc-500'>{row.id}</td>
                  <td className='py-3 px-2'>
                    <input
                      value={row.phrase}
                      onChange={(e) => updateRow(row.id, { phrase: e.target.value })}
                      className='tool-input'
                      placeholder='输入常用语内容'
                      maxLength={120}
                    />
                  </td>
                  <td className='py-3 px-2'>
                    <div className='flex items-center gap-2'>
                      <span className='tool-chip'>{MODIFIER_LABEL}</span>
                      <select
                        value={row.keyCode}
                        onChange={(e) => updateRow(row.id, { keyCode: e.target.value })}
                        className='tool-input'>
                        {KEY_OPTIONS.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className='py-3 pl-2'>
                    <button
                      onClick={() => removeRow(row.id)}
                      className='tool-btn px-2.5 py-1.5 text-xs text-red-600 border-red-200 bg-red-50 hover:bg-red-100'>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
