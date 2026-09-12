import type { LucideIcon } from 'lucide-react';

import { Boxes, Package, ArrowUp, HardDrive } from 'lucide-react';

import { DownloadKind } from '~/domain/enums/provider.enum';

export const DOWNLOAD_KIND_ICONS: Record<DownloadKind, LucideIcon> = {
  [DownloadKind.UpdateMod]: ArrowUp,
  [DownloadKind.InstallMod]: Package,
  [DownloadKind.InstallModpack]: Boxes,
  [DownloadKind.DownloadGameVersion]: HardDrive
};
