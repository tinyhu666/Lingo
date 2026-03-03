import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import * as FlagIcons from 'country-flag-icons/react/3x2';
import { Translate, ArrowRight } from '../../../icons';
import { useStore } from '../../../components/StoreProvider';
import DropdownMenu from '../../../components/DropdownMenu';
import { LANGUAGE_OPTIONS, getLanguageMeta } from '../../../constants/languages';
import { showError } from '../../../utils/toast';

const LANGUAGE_LABEL_MAP = Object.fromEntries(
  LANGUAGE_OPTIONS.map((item) => [item.id, item.label]),
);

function LanguageChip({ value, onClick }) {
  const meta = getLanguageMeta(value);
  const FlagIcon = FlagIcons[meta.countryCode];

  return (
    <button
      type='button'
      onClick={onClick}
      className='tool-btn min-w-[156px] max-w-[178px] h-14 px-3 py-2 flex items-center gap-2.5 rounded-xl text-[14px] font-semibold leading-none whitespace-nowrap'>
      <span className='w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-gray-100 shrink-0'>
        {FlagIcon ? <FlagIcon className='w-7 h-7 scale-[1.8]' /> : null}
      </span>
      <span className='truncate'>{meta.label}</span>
    </button>
  );
}

export default function TranslationDirectionCard() {
  const { settings, updateSettings } = useStore();
  const [activeMenu, setActiveMenu] = useState(null);

  const from = settings?.translation_from || 'zh';
  const to = settings?.translation_to || 'en';

  const options = useMemo(() => LANGUAGE_LABEL_MAP, []);

  const handleLanguageChange = async (lang, field) => {
    setActiveMenu(null);
    try {
      await updateSettings({ [field]: lang });
    } catch (error) {
      showError(`更新翻译语言失败: ${error}`);
    }
  };

  const renderOption = (langCode, label) => {
    const meta = getLanguageMeta(langCode);
    const FlagIcon = FlagIcons[meta.countryCode];

    return (
      <div className='flex items-center gap-2 min-w-0'>
        <span className='w-4 h-4 rounded-full overflow-hidden flex items-center justify-center bg-gray-100 shrink-0'>
          {FlagIcon ? <FlagIcon className='w-6 h-6 scale-[1.8]' /> : null}
        </span>
        <span className='truncate'>{label}</span>
      </div>
    );
  };

  return (
    <motion.section
      className='dota-card relative h-full flex flex-col rounded-2xl p-6 text-left'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}>
      <div className='flex items-center gap-3 text-sm text-zinc-500'>
        <Translate className='w-6 h-6' />
        翻译语言
      </div>

      <div className='flex-1 flex flex-col justify-between mt-4'>
        <div>
          <p className='text-sm text-zinc-400'>设置你的翻译语言。</p>
          <p className='text-sm text-zinc-400 mt-2'>语言相同也可用于润色或增强表达语气。</p>
        </div>

        <div className='flex items-center gap-3 text-zinc-900'>
          <div className='relative'>
            <LanguageChip value={from} onClick={() => setActiveMenu('from')} />
            <DropdownMenu
              show={activeMenu === 'from'}
              onClose={() => setActiveMenu(null)}
              options={options}
              currentValue={from}
              onSelect={(lang) => handleLanguageChange(lang, 'translation_from')}
              renderOption={renderOption}
            />
          </div>

          <ArrowRight className='w-6 h-6 shrink-0 text-zinc-700' />

          <div className='relative'>
            <LanguageChip value={to} onClick={() => setActiveMenu('to')} />
            <DropdownMenu
              show={activeMenu === 'to'}
              onClose={() => setActiveMenu(null)}
              options={options}
              currentValue={to}
              onSelect={(lang) => handleLanguageChange(lang, 'translation_to')}
              anchorPosition='right-0'
              renderOption={renderOption}
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
