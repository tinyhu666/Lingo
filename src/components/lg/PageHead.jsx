import React from 'react';

/**
 * PageHead — page-level title + subtitle + right slot.
 */
export default function PageHead({ title, sub, right }) {
  return (
    <header className='lg-page-head'>
      <div>
        <h1 className='lg-page-head__title'>{title}</h1>
        {sub ? <p className='lg-page-head__sub'>{sub}</p> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </header>
  );
}
