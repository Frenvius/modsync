import type { DownloadKind, DownloadStatus, GameId } from '~/domain/enums/provider.enum';

export interface DownloadItem {
  id: string;
  step: string;
  title: string;
  subtitle: string;
  progress: number;
  totalBytes: number;
  startedAt: string;
  kind: DownloadKind;
  gameId: GameId;
  etaSeconds: number;
  instanceId?: string;
  status: DownloadStatus;
  bytesPerSecond: number;
}
