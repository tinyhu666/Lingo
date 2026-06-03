import React from 'react';

/**
 * Toggle — visual on/off switch. Renders a div-only when no onClick is given,
 * or a button when interactive.
 */
export default function Toggle({ on, onClick, disabled = false, ariaLabel, className = '' }) {
  const cls = ['lg-toggle', on ? 'lg-toggle--on' : '', className].filter(Boolean).join(' ');
  if (onClick) {
    return (
      <button
        type='button'
        onClick={onClick}
        disabled={disabled}
        aria-pressed={Boolean(on)}
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
