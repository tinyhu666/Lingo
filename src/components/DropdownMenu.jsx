import { motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckTick } from '../icons';
import { twMerge } from 'tailwind-merge';

const MENU_GAP_PX = 12;
const MIN_MENU_WIDTH_PX = 196;
const VIEWPORT_PADDING_PX = 8;

export default function DropdownMenu({
  show,
  onClose,
  options,
  currentValue,
  onSelect,
  anchorPosition = 'left-0',
  direction = 'up',
  className = '',
  renderOption,
  anchorRef = null,
  usePortal = true,
}) {
  const isDownward = direction === 'down';
  const placementClass = isDownward ? 'top-full mt-3' : 'bottom-full mb-3';
  const startOffsetY = isDownward ? -10 : 10;
  const shouldUsePortal =
    show &&
    usePortal &&
    !!anchorRef?.current &&
    typeof document !== 'undefined' &&
    typeof window !== 'undefined';
  const [portalStyle, setPortalStyle] = useState(null);

  const updatePortalStyle = useCallback(() => {
    const anchorElement = anchorRef?.current;
    if (!anchorElement || typeof window === 'undefined') {
      setPortalStyle(null);
      return;
    }

    const rect = anchorElement.getBoundingClientRect();
    const nextStyle = {};

    if (direction === 'down') {
      nextStyle.top = Math.round(rect.bottom + MENU_GAP_PX);
    } else {
      nextStyle.bottom = Math.round(window.innerHeight - rect.top + MENU_GAP_PX);
    }

    if (anchorPosition === 'right-0') {
      const rawRight = window.innerWidth - rect.right;
      const maxRight = Math.max(
        VIEWPORT_PADDING_PX,
        window.innerWidth - VIEWPORT_PADDING_PX - MIN_MENU_WIDTH_PX,
      );
      nextStyle.right = Math.round(
        Math.min(Math.max(rawRight, VIEWPORT_PADDING_PX), maxRight),
      );
    } else {
      const rawLeft = rect.left;
      const maxLeft = Math.max(
        VIEWPORT_PADDING_PX,
        window.innerWidth - VIEWPORT_PADDING_PX - MIN_MENU_WIDTH_PX,
      );
      nextStyle.left = Math.round(
        Math.min(Math.max(rawLeft, VIEWPORT_PADDING_PX), maxLeft),
      );
    }

    setPortalStyle(nextStyle);
  }, [anchorPosition, anchorRef, direction]);

  useLayoutEffect(() => {
    if (!shouldUsePortal) {
      setPortalStyle(null);
      return undefined;
    }

    updatePortalStyle();
    window.addEventListener('resize', updatePortalStyle);
    window.addEventListener('scroll', updatePortalStyle, true);

    return () => {
      window.removeEventListener('resize', updatePortalStyle);
      window.removeEventListener('scroll', updatePortalStyle, true);
    };
  }, [shouldUsePortal, updatePortalStyle]);

  useEffect(() => {
    if (!show || typeof window === 'undefined') {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [show, onClose]);

  if (!show) {
    return null;
  }

  const overlayClass = shouldUsePortal
    ? 'fixed inset-0 z-[1200]'
    : 'fixed inset-0 z-20';
  const menuClass = shouldUsePortal
    ? 'shell-menu fixed z-[1300]'
    : `shell-menu absolute z-30 ${placementClass} ${anchorPosition}`;

  const menuBody = (
    <>
      <div className={overlayClass} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: startOffsetY, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: startOffsetY, scale: 0.98 }}
        style={shouldUsePortal ? portalStyle || undefined : undefined}
        className={twMerge(menuClass, className)}>
        {Object.entries(options).map(([value, label]) => {
          const isActive = value === currentValue;
          return (
            <button
              key={value}
              type='button'
              className={twMerge(
                'shell-menu__option',
                isActive
                  ? 'shell-menu__option--active'
                  : 'shell-menu__option--idle',
              )}
              onClick={() => onSelect(value)}>
              {renderOption ? renderOption(value, label) : label}
              {isActive ? <CheckTick className='ml-auto h-5 w-5 stroke-zinc-900' /> : null}
            </button>
          );
        })}
      </motion.div>
    </>
  );

  return shouldUsePortal ? createPortal(menuBody, document.body) : menuBody;
}
