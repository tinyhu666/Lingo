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
      className='home-language-chip tool-control-text w-full'>
      <span className='w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-gray-100 shrink-0'>
        {FlagIcon ? <FlagIcon className='w-7 h-7 scale-[1.8]' /> : null}
      </span>
      <span className='min-w-0 truncate'>{meta.label}</span>
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
      className='dota-card relative h-full min-h-[248px] flex flex-col rounded-2xl p-6 text-left'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}>
      <div className='flex items-center gap-3'>
        <Translate className='w-6 h-6' />
        <h3 className='tool-card-title'>翻译语言</h3>
      </div>

      <div className='flex-1 flex flex-col mt-4'>
        <div>
          <p className='tool-body'>设置你的翻译语言。</p>
          <p className='tool-body mt-2'>语言相同也可用于润色或增强表达语气。</p>
        </div>

        <div className='mt-auto'>
          <div className='tool-control-slot mt-4'>
            <div className='home-top-control-shell'>
              <div className='grid h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-zinc-900'>
                <div className='relative min-w-0'>
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

                <div className='h-11 w-9 flex items-center justify-center'>
                  <ArrowRight className='w-6 h-6 shrink-0 text-zinc-700' />
                </div>

                <div className='relative min-w-0'>
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
          </div>
          <div className='mt-2 h-4' aria-hidden='true' />
        </div>
      </div>
    </motion.section>
  );
}
