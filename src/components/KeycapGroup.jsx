import { twMerge } from 'tailwind-merge';

export default function KeycapGroup({ keys = [], size = 'md', className }) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return null;
  }

  return (
    <span className={twMerge('keycap-group', className)}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className='keycap-group__item'>
          {index > 0 ? (
            <span className={twMerge('keycap-separator', size === 'sm' && 'keycap-separator--sm')} aria-hidden='true'>
              +
            </span>
          ) : null}
          <span className={twMerge('keycap', size === 'sm' && 'keycap--sm')}>
            {key}
          </span>
        </span>
      ))}
    </span>
  );
}
