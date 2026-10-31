import React from 'react';

/**
 * Toggle — visual on/off switch. Renders a div-only when no onClick is given,
 * or a button when interactive.
 *
 * size: 'md' (default) | 'lg'
 */
export default function Toggle({ on, onClick, disabled = false, ariaLabel, size = 'md', className = '' }) {
  const cls = ['lg-toggle', on ? 'lg-toggle--on' : '', size === 'lg' ? 'lg-toggle--lg' : '', className]
    .filter(Boolean)
    .join(' ');
  if (onClick) {
    return (
      <button
        type='button'
        role='switch'
        onClick={onClick}
        disabled={disabled}
        aria-checked={Boolean(on)}
        aria-label={ariaLabel}
        className={cls}>
        <span className='lg-toggle__thumb' />
      </button>
    );
  }
  return (
    <div className={cls} aria-hidden='true'>
      <span className='lg-toggle__thumb' />
    </div>
  );
}
