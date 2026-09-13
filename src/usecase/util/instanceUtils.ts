import type { Instance } from '~/domain/interfaces/instance.interface';

import { UpdateStatus } from '~/domain/enums/provider.enum';

export const summarizeStatus = (instance: Instance): UpdateStatus => {
  const statuses = instance.mods.map((mod) => mod.status);
  if (statuses.includes(UpdateStatus.Damaged)) return UpdateStatus.Damaged;
  if (statuses.includes(UpdateStatus.Incompatible)) return UpdateStatus.Incompatible;
  if (statuses.includes(UpdateStatus.DependencyMissing)) return UpdateStatus.DependencyMissing;
  if (statuses.includes(UpdateStatus.UpdateAvailable)) return UpdateStatus.UpdateAvailable;
  return UpdateStatus.UpToDate;
};
