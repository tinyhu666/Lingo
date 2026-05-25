import React from 'react';

/**
 * Kbd — render a row of keyboard caps separated by + glyphs.
 *
 * keys: array of strings, e.g. ['⌘','⇧','T']
 */
export default function Kbd({ keys = [], className = '' }) {
  const cls = ['lg-kbd-row', className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {keys.map((k, i) => (
        <React.Fragment key={`${k}-${i}`}>
          {i > 0 ? <span className='lg-kbd-row__plus'>+</span> : null}
          <span className='lg-kbd'>{k}</span>
        </React.Fragment>
      ))}
    </span>
  );
}
