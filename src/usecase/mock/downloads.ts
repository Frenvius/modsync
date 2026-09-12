import type { DownloadItem } from '~/domain/interfaces/download.interface';

import { DownloadKind, DownloadStatus, GameId } from '~/domain/enums/provider.enum';

export const DOWNLOADS: Array<DownloadItem> = [
  {
    id: 'dl-1',
    kind: DownloadKind.UpdateMod,
    gameId: GameId.Minecraft,
    title: 'Fabric API 0.115.2+1.21.4',
    subtitle: 'Vanilla+',
    instanceId: 'inst-vanilla-plus',
    step: 'Downloading file',
    status: DownloadStatus.Active,
    progress: 62,
    totalBytes: 2_410_000,
    bytesPerSecond: 8_400_000,
    etaSeconds: 1,
    startedAt: '2026-09-05T21:10:00Z'
  },
  {
    id: 'dl-2',
    kind: DownloadKind.InstallModpack,
    gameId: GameId.Minecraft,
    title: 'Fabric Performance 3.0.1',
    subtitle: 'Creating instance',
    step: 'Resolving dependencies (3/5)',
    status: DownloadStatus.Active,
    progress: 34,
    totalBytes: 18_900_000,
    bytesPerSecond: 5_200_000,
    etaSeconds: 4,
    startedAt: '2026-09-05T21:09:30Z'
  },
  {
    id: 'dl-3',
    kind: DownloadKind.DownloadGameVersion,
    gameId: GameId.Minecraft,
    title: 'Minecraft 1.21.4',
    subtitle: 'Game files',
    step: 'Verifying assets',
    status: DownloadStatus.Paused,
    progress: 81,
    totalBytes: 412_000_000,
    bytesPerSecond: 0,
    etaSeconds: 0,
    startedAt: '2026-09-05T20:58:00Z'
  },
  {
    id: 'dl-4',
    kind: DownloadKind.InstallMod,
    gameId: GameId.Valheim,
    title: 'EpicLoot 0.10.6',
    subtitle: 'Friends Server',
    instanceId: 'inst-valheim-friends',
    step: 'Queued',
    status: DownloadStatus.Queued,
    progress: 0,
    totalBytes: 3_100_000,
    bytesPerSecond: 0,
    etaSeconds: 0,
    startedAt: '2026-09-05T21:10:20Z'
  },
  {
    id: 'dl-5',
    kind: DownloadKind.UpdateMod,
    gameId: GameId.Valheim,
    title: 'Jotunn 2.24.3',
    subtitle: 'Friends Server',
    instanceId: 'inst-valheim-friends',
    step: 'Done',
    status: DownloadStatus.Completed,
    progress: 100,
    totalBytes: 1_050_000,
    bytesPerSecond: 0,
    etaSeconds: 0,
    startedAt: '2026-09-05T20:40:00Z'
  },
  {
    id: 'dl-6',
    kind: DownloadKind.InstallMod,
    gameId: GameId.Minecraft,
    title: 'Sodium 0.6.9',
    subtitle: 'Vanilla+',
    instanceId: 'inst-vanilla-plus',
    step: 'Done',
    status: DownloadStatus.Completed,
    progress: 100,
    totalBytes: 980_000,
    bytesPerSecond: 0,
    etaSeconds: 0,
    startedAt: '2026-09-05T20:12:00Z'
  },
  {
    id: 'dl-7',
    kind: DownloadKind.InstallMod,
    gameId: GameId.Valheim,
    title: 'BetterArchery 1.9.6',
    subtitle: 'Friends Server',
    instanceId: 'inst-valheim-friends',
    step: 'Checksum mismatch',
    status: DownloadStatus.Failed,
    progress: 100,
    totalBytes: 640_000,
    bytesPerSecond: 0,
    etaSeconds: 0,
    startedAt: '2026-09-04T18:00:00Z'
  }
];
