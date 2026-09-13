import React from 'react';

import { Ban, Check, Unplug, ArrowUp, PowerOff, ShieldAlert } from 'lucide-react';

import { UpdateStatus } from '~/domain/enums/provider.enum';

export const UPDATE_BADGE_META: Record<
  UpdateStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  [UpdateStatus.UpToDate]: { icon: Check, label: 'Up to date', className: 'bg-primary/10 text-primary' },
  [UpdateStatus.Disabled]: { icon: PowerOff, label: 'Disabled', className: 'bg-muted text-muted-foreground' },
  [UpdateStatus.UpdateAvailable]: { icon: ArrowUp, label: 'Update available', className: 'bg-info/15 text-info' },
  [UpdateStatus.Damaged]: { label: 'Damaged', icon: ShieldAlert, className: 'bg-destructive/15 text-destructive' },
  [UpdateStatus.Incompatible]: { icon: Ban, label: 'Incompatible', className: 'bg-destructive/15 text-destructive' },
  [UpdateStatus.DependencyMissing]: { icon: Unplug, label: 'Dependency missing', className: 'bg-warning/15 text-warning' }
};
