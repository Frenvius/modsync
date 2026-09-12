import type { ProjectIconProps } from './types';

import { cn } from '~/lib/utils';
import { initials } from '~/usecase/util/formatUtils';

import { PROJECT_ICON_SIZES } from './constants';

const ProjectIcon = ({ name, color, className, size = 'md' }: ProjectIconProps) => (
  <span
    aria-hidden
    style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in oklch, ${color} 55%, black) 100%)` }}
    className={cn(
      'inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-wide text-white/95 ring-1 ring-white/10',
      PROJECT_ICON_SIZES[size],
      className
    )}
  >
    {initials(name)}
  </span>
);

export default ProjectIcon;
