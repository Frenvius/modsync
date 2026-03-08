interface SyncStatusInfo {
  checking: boolean;
  is_synced: boolean;
  owner_online: boolean;
}

interface InstallProgress {
  stage: string;
  total: number;
  current: number;
  message: string;
}

interface InstallStatusInfo {
  installed: boolean;
  installing: boolean;
  loader: null | string;
  last_played: null | string;
  loader_version: null | string;
  game_version: null | string;
  progress: null | InstallProgress;
}

export interface ModpackCardProps {
  id: string;
  name: string;
  version: string;
  modCount: number;
  gameId: string;
  modSource?: string;
  imageUrl?: string;
  isOwner?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  imagePath?: null | string;
  shareCode?: null | string;
  syncInfo?: SyncStatusInfo;
  onClone?: () => void;
  onShareStatusChange?: () => void;
  installStatus?: InstallStatusInfo;
}
