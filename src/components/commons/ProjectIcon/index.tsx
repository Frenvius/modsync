import React from 'react';

import { cn } from '~/lib/utils';
import { initials } from '~/usecase/util/formatUtils';

interface ProjectIconProps {
  name: string;
  color: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: 'size-6 rounded-sm text-[9px]',
  md: 'size-9 rounded-md text-xs',
  lg: 'size-12 rounded-lg text-sm',
  xl: 'size-20 rounded-xl text-xl'
};

const ProjectIcon = ({ name, color, size = 'md', className }: ProjectIconProps) => (
  <span
    aria-hidden
    style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in oklch, ${color} 55%, black) 100%)` }}
    className={cn('inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-wide text-white/95 ring-1 ring-white/10', SIZES[size], className)}
  >
    {initials(name)}
  </span>
);

export default ProjectIcon;
