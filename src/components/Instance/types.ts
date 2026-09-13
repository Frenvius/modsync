import type { Instance, InstalledMod } from '~/domain/interfaces/instance.interface';

import React from 'react';

import { ProjectType, UpdateStatus } from '~/domain/enums/provider.enum';

export interface InstanceCardProps {
  instance: Instance;
  className?: string;
}

export interface InstanceListItemProps {
  instance: Instance;
}

export interface InstanceMenuProps {
  instance: Instance;
  variant?: 'ghost' | 'outline';
  size?: 'icon' | 'icon-lg' | 'icon-xs' | 'icon-sm';
}

export interface InstanceTabProps {
  instance: Instance;
}

export interface StatProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface UpdateListProps {
  empty: string;
  risky?: boolean;
  instanceId: string;
  mods: Array<InstalledMod>;
}

export interface ModsTabProps extends InstanceTabProps {
  contentType: ProjectType;
}

export type ModStatusFilter = 'all' | UpdateStatus;
export type ModSortKey = 'name' | 'status' | 'provider';

export interface ChangeVersionDialogProps extends InstanceTabProps {
  projectId: null | string;
  onOpenChange: (open: boolean) => void;
}
