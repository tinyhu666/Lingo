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
  return show ? (
    <>
      <div className='fixed inset-0 z-20' onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        className={twMerge(
          `absolute z-30 bottom-full mb-3 min-w-[196px] rounded-2xl border border-[rgba(205,216,230,0.94)] bg-[rgba(255,255,255,0.96)] p-2 shadow-[0_24px_48px_rgba(37,57,88,0.16)] backdrop-blur-xl ${anchorPosition}`,
          className,
        )}>
        {Object.entries(options).map(([value, label]) => {
          const isActive = value === currentValue;
          return (
            <button
              key={value}
              type='button'
              className={twMerge(
                'flex w-full items-center rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-all duration-150',
                isActive
                  ? 'bg-[linear-gradient(180deg,rgba(236,243,255,0.96)_0%,rgba(227,237,255,0.98)_100%)] text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]'
                  : 'text-zinc-600 hover:bg-[rgba(244,248,253,0.96)] hover:text-zinc-900',
              )}
              onClick={() => onSelect(value)}>
              {renderOption ? renderOption(value, label) : label}
              {isActive ? <CheckTick className='ml-auto h-5 w-5 stroke-zinc-900' /> : null}
            </button>
          );
        })}
      </motion.div>
    </>
  ) : null;
}
