import { DownloadStatus } from '~/domain/enums/provider.enum';

export const ALL_GAMES = '__all';
export const RUNNING_DOWNLOAD_STATUSES = [DownloadStatus.Active, DownloadStatus.Queued, DownloadStatus.Paused];
