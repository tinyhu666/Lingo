import { motion } from 'framer-motion';
import { Translate, ArrowRight } from '../../../icons';
import { useState } from 'react';
import { useStore } from '../../../components/StoreProvider';
import DropdownMenu from '../../../components/DropdownMenu';
import * as FlagIcons from 'country-flag-icons/react/3x2';

const LANGUAGES = {
    zh: {
        name: '中文',
        code: 'CN'
    },
    'en-SEA': {
        name: '东南亚英语',
        code: 'SG'  // 使用新加坡国旗代码
    },
    ko: {
        name: '韩文',
        code: 'KR'
    },
    en: {
        name: '英文',
        code: 'US'
    },
    fr: {
        name: '法文',
        code: 'FR'
    },
    ru: {
        name: '俄文',
        code: 'RU'
    },
    es: {
        name: '西班牙文',
        code: 'ES'
    },
    ja: {
        name: '日文',
        code: 'JP'
    },
    de: {
        name: '德文',
        code: 'DE'
    }
};

export default function TranslationDirectionCard() {
    const [showFromMenu, setShowFromMenu] = useState(false);
    const [showToMenu, setShowToMenu] = useState(false);
    const { settings, updateSettings } = useStore();

    const from = settings?.translation_from || 'zh';
    const to = settings?.translation_to || 'en';

    const handleLanguageSelect = async (lang, isFrom) => {
        if (isFrom) {
            setShowFromMenu(false);
            await updateSettings({ translation_from: lang });
        } else {
            setShowToMenu(false);
            await updateSettings({ translation_to: lang });
        }
    };

    const renderLanguageButton = (lang, onClick) => {
        const FlagIcon = FlagIcons[LANGUAGES[lang].code];
        return (
            <button
                type="button"
                onClick={onClick}
                className="tool-btn shrink-0 whitespace-nowrap px-4 py-2 flex items-center gap-2 text-xl font-semibold leading-none shadow-sm"
            >
                <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-gray-100">
                    <FlagIcon className="w-7 h-7 scale-[1.8]" />
                </div>
                {LANGUAGES[lang].name}
            </button>
        );
    };

    return (
        <motion.div
            className="dota-card relative h-full flex flex-col rounded-2xl p-6 transition-all duration-200 text-left"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex items-center gap-3 text-sm text-zinc-500">
                <Translate className="w-6 h-6" />
                翻译语言
            </div>
            <div className="flex-1 flex flex-col justify-between mt-4">
                <div>
                    <div className="text-sm text-zinc-400">
                        设置你的翻译语言。
                    </div>
                    <div className="text-sm text-zinc-400 mt-2">
                        语言相同也可用于润色或增强表达语气。
                    </div>
                </div>
                <div className="flex items-center gap-3 text-zinc-900">
                    <div className="relative">
                        {renderLanguageButton(from, () => setShowFromMenu(true))}
                        <DropdownMenu
                            options={Object.fromEntries(
                                Object.entries(LANGUAGES).map(([key, value]) => [key, value.name])
                            )}
                            onSelect={(lang) => handleLanguageSelect(lang, true)}
                            show={showFromMenu}
                            onClose={() => setShowFromMenu(false)}
                            currentValue={from}
                            renderOption={(key, value) => {
                                const FlagIcon = FlagIcons[LANGUAGES[key].code];
                                return (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center bg-gray-100">
                                            <FlagIcon className="w-6 h-6 scale-[1.8]" />
                                        </div>
                                        {value}
                                    </div>
                                );
                            }}
                        />
                    </div>
                    <ArrowRight className="w-6 h-6 shrink-0 text-zinc-700" />
                    <div className="relative">
                        {renderLanguageButton(to, () => setShowToMenu(true))}
                        <DropdownMenu
                            options={Object.fromEntries(
                                Object.entries(LANGUAGES).map(([key, value]) => [key, value.name])
                            )}
                            onSelect={(lang) => handleLanguageSelect(lang, false)}
                            show={showToMenu}
                            onClose={() => setShowToMenu(false)}
                            currentValue={to}
                            anchorPosition="right-0"
                            renderOption={(key, value) => {
                                const FlagIcon = FlagIcons[LANGUAGES[key].code];
                                return (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center bg-gray-100">
                                            <FlagIcon className="w-6 h-6 scale-[1.8]" />
                                        </div>
                                        {value}
                                    </div>
                                );
                            }}
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
} 
