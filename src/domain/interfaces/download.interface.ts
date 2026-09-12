import type { GameId, DownloadKind, DownloadStatus } from '~/domain/enums/provider.enum';

export interface DownloadItem {
  id: string;
  step: string;
  title: string;
  gameId: GameId;
  subtitle: string;
  progress: number;
  startedAt: string;
  totalBytes: number;
  kind: DownloadKind;
  etaSeconds: number;
  instanceId?: string;
  status: DownloadStatus;
  bytesPerSecond: number;
}
