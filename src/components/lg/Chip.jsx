import React from 'react';

/**
 * Chip — small pill-shaped label.
 *
 * tone: default | success | warn | warn-strong | info | danger | brand | neutral
 * lg:   larger size variant
 * dot:  show leading colored dot
 */
export default function Chip({ tone = 'default', children, dot = false, lg = false, className = '' }) {
  const toneClass = tone && tone !== 'default' ? `lg-chip--${tone}` : '';
  const sizeClass = lg ? 'lg-chip--lg' : '';
  const cls = ['lg-chip', toneClass, sizeClass, className].filter(Boolean).join(' ');

  return (
    <span className={cls}>
      {dot ? <span className='lg-chip__dot' /> : null}
      {children}
    </span>
  );
}
