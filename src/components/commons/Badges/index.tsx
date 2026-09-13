import type { UpdateBadgeProps, VersionBadgeProps, ProviderBadgeProps, CompatibilityBadgeProps } from './types';

import { Ban, Check, TriangleAlert } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { LOADER_NAMES } from '~/domain/data/catalog';
import { LoaderId } from '~/domain/enums/provider.enum';
import { getProviderMeta } from '~/usecase/service/providers';

import { UPDATE_BADGE_META } from './constants';

export const ProviderBadge = ({ compact, className, providerId }: ProviderBadgeProps) => {
  const meta = getProviderMeta(providerId);
  return (
    <Badge
      variant="outline"
      title={meta.name}
      className={cn('gap-1.5 text-foreground', className)}
      style={{
        background: `color-mix(in oklch, ${meta.color} 14%, var(--muted))`,
        borderColor: `color-mix(in oklch, ${meta.color} 40%, var(--border))`
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {!compact && meta.name}
    </Badge>
  );
};

export const VersionBadge = ({ loader, version, className }: VersionBadgeProps) => (
  <Badge variant="secondary" className={cn('font-mono text-[11px] tabular-nums', className)}>
    {loader && loader !== LoaderId.Vanilla ? `${LOADER_NAMES[loader]} ${version}` : version}
  </Badge>
);

export const UpdateBadge = ({ status, className }: UpdateBadgeProps) => {
  const meta = UPDATE_BADGE_META[status];
  return (
    <Badge className={cn('gap-1', meta.className, className)}>
      <meta.icon />
      {meta.label}
    </Badge>
  );
};

export const CompatibilityBadge = ({ issues, className }: CompatibilityBadgeProps) => {
  const worst = issues.find((i) => i.severity === 'error') ?? issues[0];
  if (!worst) {
    return (
      <Badge className={cn('gap-1 bg-primary/10 text-primary', className)}>
        <Check />
        Compatible
      </Badge>
    );
  }
  const error = worst.severity === 'error';
  return (
    <Badge
      title={worst.message}
      className={cn('gap-1', error ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning', className)}
    >
      {error ? <Ban /> : <TriangleAlert />}
      {error ? 'Incompatible' : 'Check compatibility'}
    </Badge>
  );
};
