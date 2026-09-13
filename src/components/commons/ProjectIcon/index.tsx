import type { ProjectIconProps } from './types';

import { cn } from '~/lib/utils';
import { initials } from '~/usecase/util/formatUtils';

import { PROJECT_ICON_SIZES } from './constants';

const ProjectIcon = ({ name, color, imageUrl, className, size = 'md' }: ProjectIconProps) => {
  return (
    <span
      aria-hidden
      style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in oklch, ${color} 55%, black) 100%)` }}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold tracking-wide text-white/95 ring-1 ring-white/10',
        PROJECT_ICON_SIZES[size],
        className
      )}
    >
      {initials(name)}
      {imageUrl && (
        <img
          alt=""
          src={imageUrl}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onLoad={(event) => (event.currentTarget.hidden = false)}
          onError={(event) => (event.currentTarget.hidden = true)}
        />
      )}
    </span>
  );
};

export default ProjectIcon;
