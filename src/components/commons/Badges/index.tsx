import type { ProviderId } from '~/domain/enums/provider.enum';
import type { CompatibilityIssue } from '~/domain/interfaces/project.interface';

import React from 'react';
import { Ban, Check, ArrowUp, Unplug, PowerOff, TriangleAlert } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { LOADER_NAMES } from '~/usecase/mock/games';
import { LoaderId, UpdateStatus } from '~/domain/enums/provider.enum';
import { getProviderMeta } from '~/usecase/service/providers';

interface ProviderBadgeProps {
  providerId: ProviderId;
  className?: string;
  compact?: boolean;
}

export const ProviderBadge = ({ providerId, compact, className }: ProviderBadgeProps) => {
  const meta = getProviderMeta(providerId);
  return (
    <Badge variant="outline" title={meta.name} className={cn('gap-1.5 border-border/60 bg-muted/40 text-muted-foreground', className)}>
      <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {!compact && meta.name}
    </Badge>
  );
};

interface VersionBadgeProps {
  version: string;
  loader?: LoaderId;
  className?: string;
}

export const VersionBadge = ({ version, loader, className }: VersionBadgeProps) => (
  <Badge variant="secondary" className={cn('font-mono text-[11px] tabular-nums', className)}>
    {loader && loader !== LoaderId.Vanilla ? `${LOADER_NAMES[loader]} ${version}` : version}
  </Badge>
);

const UPDATE_META: Record<UpdateStatus, { icon: React.ComponentType<{ className?: string }>; label: string; className: string }> = {
  [UpdateStatus.UpToDate]: { icon: Check, label: 'Up to date', className: 'bg-primary/10 text-primary' },
  [UpdateStatus.UpdateAvailable]: { icon: ArrowUp, label: 'Update available', className: 'bg-info/15 text-info' },
  [UpdateStatus.Incompatible]: { icon: Ban, label: 'Incompatible', className: 'bg-destructive/15 text-destructive' },
  [UpdateStatus.DependencyMissing]: { icon: Unplug, label: 'Dependency missing', className: 'bg-warning/15 text-warning' },
  [UpdateStatus.Disabled]: { icon: PowerOff, label: 'Disabled', className: 'bg-muted text-muted-foreground' }
};

interface UpdateBadgeProps {
  status: UpdateStatus;
  className?: string;
}

export const UpdateBadge = ({ status, className }: UpdateBadgeProps) => {
  const meta = UPDATE_META[status];
  return (
    <Badge className={cn('gap-1', meta.className, className)}>
      <meta.icon />
      {meta.label}
    </Badge>
  );
};

interface CompatibilityBadgeProps {
  issues: Array<CompatibilityIssue>;
  className?: string;
}

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
    <Badge className={cn('gap-1', error ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning', className)} title={worst.message}>
      {error ? <Ban /> : <TriangleAlert />}
      {error ? 'Incompatible' : 'Check compatibility'}
    </Badge>
  );
};
