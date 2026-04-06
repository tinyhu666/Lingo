import { twMerge } from 'tailwind-merge';

export default function KeycapGroup({ keys = [], size = 'md', className }) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return null;
  }

  return (
    <span className={twMerge('keycap-group', className)}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className={twMerge('keycap', size === 'sm' && 'keycap--sm')}>
          {key}
        </span>
      ))}
    </span>
  );
}
