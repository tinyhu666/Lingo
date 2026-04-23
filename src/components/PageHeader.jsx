import { twMerge } from 'tailwind-merge';

export default function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  className,
  contentClassName,
  actionsClassName,
}) {
  return (
    <div className={twMerge('page-header', className)}>
      <div className={twMerge('page-header__content', contentClassName)}>
        {eyebrow ? <div className='page-header__eyebrow'>{eyebrow}</div> : null}
        <div className='page-header__title-row'>
          {icon ? <span className='page-header__icon-shell'>{icon}</span> : null}
          <div className='page-header__copy'>
            <h2 className='tool-page-title mt-0'>{title}</h2>
            {description ? <p className='tool-body page-header__description'>{description}</p> : null}
          </div>
        </div>
      </div>

      {actions ? <div className={twMerge('page-header__actions', actionsClassName)}>{actions}</div> : null}
    </div>
  );
}
