import type { DownloadItem } from '~/domain/interfaces/download.interface';

import { GameId, DownloadKind, DownloadStatus } from '~/domain/enums/provider.enum';

export const DOWNLOADS: Array<DownloadItem> = [
  {
    id: 'dl-1',
    progress: 62,
    etaSeconds: 1,
    subtitle: 'Vanilla+',
    totalBytes: 2_410_000,
    gameId: GameId.Minecraft,
    step: 'Downloading file',
    bytesPerSecond: 8_400_000,
    kind: DownloadKind.UpdateMod,
    status: DownloadStatus.Active,
    instanceId: 'inst-vanilla-plus',
    startedAt: '2026-09-05T21:10:00Z',
    title: 'Fabric API 0.115.2+1.21.4'
  },
  {
    id: 'dl-3',
    progress: 81,
    etaSeconds: 0,
    bytesPerSecond: 0,
    subtitle: 'Game files',
    totalBytes: 412_000_000,
    gameId: GameId.Minecraft,
    step: 'Verifying assets',
    title: 'Minecraft 1.21.4',
    status: DownloadStatus.Paused,
    startedAt: '2026-09-05T20:58:00Z',
    kind: DownloadKind.DownloadGameVersion
  },
  {
    id: 'dl-4',
    progress: 0,
    etaSeconds: 0,
    step: 'Queued',
    bytesPerSecond: 0,
    totalBytes: 3_100_000,
    gameId: GameId.Valheim,
    title: 'EpicLoot 0.10.6',
    subtitle: 'Friends Server',
    kind: DownloadKind.InstallMod,
    status: DownloadStatus.Queued,
    startedAt: '2026-09-05T21:10:20Z',
    instanceId: 'inst-valheim-friends'
  },
  {
    id: 'dl-5',
    step: 'Done',
    progress: 100,
    etaSeconds: 0,
    bytesPerSecond: 0,
    totalBytes: 1_050_000,
    gameId: GameId.Valheim,
    title: 'Jotunn 2.24.3',
    subtitle: 'Friends Server',
    kind: DownloadKind.UpdateMod,
    status: DownloadStatus.Completed,
    startedAt: '2026-09-05T20:40:00Z',
    instanceId: 'inst-valheim-friends'
  },
  {
    id: 'dl-6',
    step: 'Done',
    progress: 100,
    etaSeconds: 0,
    bytesPerSecond: 0,
    totalBytes: 980_000,
    subtitle: 'Vanilla+',
    title: 'Sodium 0.6.9',
    gameId: GameId.Minecraft,
    kind: DownloadKind.InstallMod,
    instanceId: 'inst-vanilla-plus',
    status: DownloadStatus.Completed,
    startedAt: '2026-09-05T20:12:00Z'
  },
  {
    id: 'dl-7',
    progress: 100,
    etaSeconds: 0,
    bytesPerSecond: 0,
    totalBytes: 640_000,
    gameId: GameId.Valheim,
    step: 'Checksum mismatch',
    subtitle: 'Friends Server',
    title: 'BetterArchery 1.9.6',
    kind: DownloadKind.InstallMod,
    status: DownloadStatus.Failed,
    startedAt: '2026-09-04T18:00:00Z',
    instanceId: 'inst-valheim-friends'
  }
];
