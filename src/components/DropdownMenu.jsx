import { motion } from 'framer-motion';
import { CheckTick } from '../icons';
import { twMerge } from 'tailwind-merge';

export default function DropdownMenu({
    show,
    onClose,
    options,
    currentValue,
    onSelect,
    anchorPosition = 'left-0',
    className = '',
    renderOption
}) {
    return show && (
        <>
            <div
                className="fixed inset-0 z-10"
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={twMerge(
                    `absolute z-20 bottom-full mb-2 min-w-[178px] p-2 rounded-xl bg-white border border-zinc-200 shadow-[0_14px_30px_rgba(15,23,42,0.16)] ${anchorPosition}`,
                    className
                )}
            >
                {Object.entries(options).map(([value, label]) => {
                    const isActive = value === currentValue;
                    return (
                        <button
                            key={value}
                            className={twMerge(
                                'w-full flex items-center px-3.5 py-2.5 text-sm font-semibold relative rounded-lg transition-colors',
                                isActive
                                    ? 'text-zinc-900 font-semibold bg-blue-50'
                                    : 'text-zinc-600 hover:bg-zinc-100'
                            )}
                            onClick={() => onSelect(value)}
                        >
                            {renderOption ? renderOption(value, label) : label}
                            {isActive && (
                                <CheckTick className="w-6 h-6 ml-auto stroke-zinc-900" />
                            )}
                        </button>
                    );
                })}
            </motion.div>
        </>
    );
} 
