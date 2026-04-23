import { twMerge } from 'tailwind-merge';

export default function PanelCard({
  as: Component = 'section',
  title,
  description,
  icon,
  actions,
  children,
  className,
  headerClassName,
  bodyClassName,
  ...props
}) {
  const hasHeader = Boolean(title || description || icon || actions);

  return (
    <Component className={twMerge('panel-card', className)} {...props}>
      {hasHeader ? (
        <div className={twMerge('panel-card__header', headerClassName)}>
          <div className='panel-card__heading'>
            {icon ? <span className='panel-card__icon-shell'>{icon}</span> : null}
            <div className='panel-card__copy'>
              {title ? <h3 className='tool-card-title'>{title}</h3> : null}
              {description ? <p className='tool-body panel-card__description'>{description}</p> : null}
            </div>
          </div>

          {actions ? <div className='panel-card__actions'>{actions}</div> : null}
        </div>
      ) : null}

      <div className={twMerge('panel-card__body', bodyClassName)}>{children}</div>
    </Component>
  );
}
