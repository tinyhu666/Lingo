import { twMerge } from 'tailwind-merge';

const TONE_CLASS = {
  neutral: 'status-chip--neutral',
  success: 'status-chip--success',
  warning: 'status-chip--warning',
  info: 'status-chip--info',
  danger: 'status-chip--danger',
};

export default function StatusChip({ label, tone = 'neutral', icon, className }) {
  return (
    <span className={twMerge('status-chip', TONE_CLASS[tone] || TONE_CLASS.neutral, className)}>
      {icon ? <span className='status-chip__icon'>{icon}</span> : null}
      <span>{label}</span>
    </span>
  );
}
