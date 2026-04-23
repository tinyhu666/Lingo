export default function PageHeader({
  eyebrow,
  meta,
  title,
  summary,
  icon: Icon,
  aside,
  className = '',
}) {
  return (
    <section className={`page-header-card ${className}`.trim()}>
      <div className='page-header-card__glow' aria-hidden='true' />
      <div className='page-header'>
        <div className='page-header__main'>
          {eyebrow || meta ? (
            <div className='page-header__eyebrow-row'>
              {eyebrow ? <span className='page-header__eyebrow'>{eyebrow}</span> : null}
              {meta}
            </div>
          ) : null}

          <div className='page-header__headline'>
            <div className='page-header__title-row'>
              {Icon ? (
                <span className='workspace-header__icon page-header__icon-shell' aria-hidden='true'>
                  <Icon className='h-5 w-5 stroke-current' />
                </span>
              ) : null}
              <div className='min-w-0'>
                <h1 className='tool-page-title page-header__title'>{title}</h1>
              </div>
            </div>

            {summary ? <p className='tool-body page-header__summary'>{summary}</p> : null}
          </div>
        </div>

        {aside ? <div className='page-header__aside'>{aside}</div> : null}
      </div>
    </section>
  );
}
