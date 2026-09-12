import type { InstanceIconProps } from './types';

import { Package } from 'lucide-react';

import { cn } from '~/lib/utils';

import { INSTANCE_ICONS, INSTANCE_ICON_SIZES } from './constants';

const InstanceIcon = ({ icon, color, className, size = 'md' }: InstanceIconProps) => {
  const Icon = INSTANCE_ICONS[icon] ?? Package;
  return (
    <span
      aria-hidden
      style={{ background: `linear-gradient(145deg, ${color}, color-mix(in oklch, ${color} 50%, black))` }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-white shadow-[inset_0_1px_0_oklch(1_0_0/20%),0_2px_8px_-2px_oklch(0_0_0/50%)]',
        INSTANCE_ICON_SIZES[size],
        className
      )}
    >
      <Icon strokeWidth={2.25} />
    </span>
  );
};

export default InstanceIcon;
