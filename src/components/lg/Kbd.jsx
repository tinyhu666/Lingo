import React from 'react';

/**
 * Kbd — render a row of keyboard caps separated by + glyphs.
 *
 * keys:      array of strings, e.g. ['⌘','⇧','T']
 * size:      'md' (default) | 'sm'
 * recording: pulse the caps while a new combination is being captured
 * pressed:   indexes of caps that should render in the pressed state
 */
export default function Kbd({ keys = [], size = 'md', recording = false, pressed = [], className = '' }) {
  const rowClass = ['lg-kbd-row', recording ? 'lg-kbd-row--rec' : '', className].filter(Boolean).join(' ');
  const capClass = ['lg-kbd', size === 'sm' ? 'lg-kbd--sm' : ''].filter(Boolean).join(' ');
  return (
    <span className={rowClass}>
      {keys.map((k, i) => (
        <React.Fragment key={`${k}-${i}`}>
          {i > 0 ? <span className='lg-kbd-row__plus'>+</span> : null}
          <span className={`${capClass}${pressed.includes(i) ? ' lg-kbd--press' : ''}`}>{k}</span>
        </React.Fragment>
      ))}
    </span>
  );
}
