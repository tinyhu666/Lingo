import { motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import * as FlagIcons from 'country-flag-icons/react/3x2';
import { Translate, ArrowRight, ChevronRight } from '../../../icons';
import { useStore } from '../../../components/StoreProvider';
import DropdownMenu from '../../../components/DropdownMenu';
import { LANGUAGE_OPTIONS, getLanguageMeta } from '../../../constants/languages';
import { showError } from '../../../utils/toast';

const LANGUAGE_LABEL_MAP = Object.fromEntries(
  LANGUAGE_OPTIONS.map((item) => [item.id, item.label]),
);

function LanguageChip({ value, onClick, expanded, direction }) {
  const meta = getLanguageMeta(value);
  const FlagIcon = FlagIcons[meta.countryCode];
  const caretClass =
    expanded && direction === 'up'
      ? 'home-language-chip__caret-icon home-language-chip__caret-icon--up'
      : 'home-language-chip__caret-icon home-language-chip__caret-icon--down';

  return (
    <button
      type='button'
      onClick={onClick}
      aria-haspopup='menu'
      aria-expanded={expanded}
      className={`home-language-chip w-full min-w-0 ${expanded ? 'home-language-chip--active' : ''}`}>
      <span className='home-language-chip__meta'>
        <span className='w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-gray-100 shrink-0'>
          {FlagIcon ? <FlagIcon className='w-7 h-7 scale-[1.8]' /> : null}
        </span>
        <span className='tool-control-text home-language-chip__label whitespace-nowrap'>{meta.label}</span>
      </span>
      <span className='home-language-chip__caret' aria-hidden='true'>
        <ChevronRight className={caretClass} />
      </span>
    </button>
  );
}

const MENU_HEIGHT_PX = 276;

export default function TranslationDirectionCard() {
  const { settings, updateSettings } = useStore();
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuDirection, setMenuDirection] = useState({ from: 'up', to: 'up' });
  const fromTriggerRef = useRef(null);
  const toTriggerRef = useRef(null);

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

  const resolveDirection = (triggerElement) => {
    if (!triggerElement || typeof window === 'undefined') {
      return 'up';
    }

    const rect = triggerElement.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceBelow >= MENU_HEIGHT_PX) {
      return 'down';
    }

    if (spaceAbove >= MENU_HEIGHT_PX) {
      return 'up';
    }

    return spaceBelow > spaceAbove ? 'down' : 'up';
  };

  const handleMenuToggle = (field) => {
    const trigger = field === 'from' ? fromTriggerRef.current : toTriggerRef.current;
    const nextDirection = resolveDirection(trigger);
    setMenuDirection((current) => ({ ...current, [field]: nextDirection }));
    setActiveMenu((current) => (current === field ? null : field));
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
      className='dota-card relative w-full min-h-[248px] flex-1 flex flex-col rounded-2xl px-6 pt-6 pb-3 text-left'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}>
      <div className='flex items-center gap-3'>
        <Translate className='w-6 h-6' />
        <h3 className='tool-card-title'>翻译语言</h3>
      </div>

      <div className='flex-1 flex flex-col mt-4'>
        <div className='home-top-copy'>
          <p className='tool-body'>设置你的翻译语言。</p>
          <p className='tool-body mt-2'>语言相同也可用于润色或增强表达语气。</p>
        </div>

        <div className='home-top-actions'>
          <div className='tool-control-slot home-top-control-slot'>
            <div className='home-top-control-shell'>
              <div className='grid h-full w-full grid-cols-[minmax(0,1fr)_26px_minmax(0,1fr)] items-center gap-1 text-zinc-900'>
                <div className='relative min-w-0' ref={fromTriggerRef}>
                  <LanguageChip
                    value={from}
                    onClick={() => handleMenuToggle('from')}
                    expanded={activeMenu === 'from'}
                    direction={menuDirection.from}
                  />
                  <DropdownMenu
                    show={activeMenu === 'from'}
                    onClose={() => setActiveMenu(null)}
                    options={options}
                    currentValue={from}
                    onSelect={(lang) => handleLanguageChange(lang, 'translation_from')}
                    direction={menuDirection.from}
                    renderOption={renderOption}
                  />
                </div>

                <div className='h-11 w-[26px] flex items-center justify-center'>
                  <ArrowRight className='w-6 h-6 shrink-0 text-zinc-700' />
                </div>

                <div className='relative min-w-0' ref={toTriggerRef}>
                  <LanguageChip
                    value={to}
                    onClick={() => handleMenuToggle('to')}
                    expanded={activeMenu === 'to'}
                    direction={menuDirection.to}
                  />
                  <DropdownMenu
                    show={activeMenu === 'to'}
                    onClose={() => setActiveMenu(null)}
                    options={options}
                    currentValue={to}
                    onSelect={(lang) => handleLanguageChange(lang, 'translation_to')}
                    anchorPosition='right-0'
                    direction={menuDirection.to}
                    renderOption={renderOption}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
