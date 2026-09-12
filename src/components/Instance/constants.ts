import type { ModStatusFilter } from './types';
import type { LogLine } from '~/domain/interfaces/instance.interface';

import { UpdateStatus } from '~/domain/enums/provider.enum';

export const MOD_STATUS_LABELS: Record<ModStatusFilter, string> = {
  all: 'All statuses',
  [UpdateStatus.Disabled]: 'Disabled',
  [UpdateStatus.UpToDate]: 'Up to date',
  [UpdateStatus.Incompatible]: 'Incompatible',
  [UpdateStatus.UpdateAvailable]: 'Update available',
  [UpdateStatus.DependencyMissing]: 'Dependency missing'
};

export const LOG_LEVELS: Array<LogLine['level']> = ['debug', 'info', 'warn', 'error'];
export const LOG_LEVEL_CLASSES: Record<LogLine['level'], string> = {
  warn: 'text-warning',
  info: 'text-foreground',
  error: 'text-destructive',
  debug: 'text-muted-foreground'
};
