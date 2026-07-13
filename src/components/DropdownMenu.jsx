import { motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionRefs = useRef([]);
  const optionEntries = Object.entries(options);

  const focusAnchor = useCallback(() => {
    const anchor = anchorRef?.current;
    const trigger = anchor?.matches?.('button') ? anchor : anchor?.querySelector?.('button');
    trigger?.focus?.();
  }, [anchorRef]);

  const focusOption = useCallback(
    (index) => {
      if (optionEntries.length === 0) return;
      const nextIndex = (index + optionEntries.length) % optionEntries.length;
      setActiveIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    },
    [optionEntries.length],
  );

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
      window.requestAnimationFrame(focusAnchor);
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [show, onClose, focusAnchor]);

  useEffect(() => {
    if (!show || optionEntries.length === 0 || typeof window === 'undefined') {
      return undefined;
    }

    const selectedIndex = optionEntries.findIndex(([value]) => value === currentValue);
    const initialIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(initialIndex);
    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[initialIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [show, currentValue, options, optionEntries.length]);

  const handleMenuKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(activeIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(optionEntries.length - 1);
    }
  };

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
      <div className={overlayClass} aria-hidden='true' onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: startOffsetY, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: startOffsetY, scale: 0.98 }}
        style={shouldUsePortal ? portalStyle || undefined : undefined}
        className={twMerge(menuClass, className)}
        role='menu'
        aria-orientation='vertical'
        onKeyDown={handleMenuKeyDown}>
        {optionEntries.map(([value, label], index) => {
          const isActive = value === currentValue;
          return (
            <button
              key={value}
              type='button'
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role='menuitemradio'
              aria-checked={isActive}
              tabIndex={activeIndex === index ? 0 : -1}
              className={twMerge(
                'shell-menu__option',
                isActive
                  ? 'shell-menu__option--active'
                  : 'shell-menu__option--idle',
              )}
              onFocus={() => setActiveIndex(index)}
              onClick={() => {
                focusAnchor();
                onSelect(value);
              }}>
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
