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
  renderOption,
}) {
  return (
    show && (
      <>
        <div className='fixed inset-0 z-10' onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className={twMerge(
            `absolute z-20 bottom-full mb-2 min-w-[198px] p-2 rounded-xl border border-[#394760] bg-[#1f2737] shadow-[0_16px_36px_rgba(3,7,14,0.55)] ${anchorPosition}`,
            className,
          )}>
          {Object.entries(options).map(([value, label]) => {
            const isActive = value === currentValue;
            return (
              <button
                key={value}
                className={twMerge(
                  'w-full flex items-center px-3.5 py-2.5 text-sm font-semibold relative rounded-lg transition-colors text-left',
                  isActive
                    ? 'text-[#f3f7ff] bg-[#2f4065] border border-[#5e80cb]'
                    : 'text-[#9aa7c2] hover:bg-[#29344b] hover:text-[#e5edff] border border-transparent',
                )}
                onClick={() => onSelect(value)}>
                {renderOption ? renderOption(value, label) : label}
                {isActive && <CheckTick className='w-5 h-5 ml-auto text-[#cfe2ff]' />}
              </button>
            );
          })}
        </motion.div>
      </>
    )
  );
}
