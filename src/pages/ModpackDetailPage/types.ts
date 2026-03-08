export interface ModpackMod {
  slug: string;
  title: string;
  author: string;
  version: string;
  enabled?: boolean;
  icon_url: null | string;
  filename?: null | string;
  version_id: null | string;
  is_loader?: boolean;
}

export interface Modpack {
  id: string;
  name: string;
  game_id: string;
  game_version: string;
  loader: null | string;
  is_owner: boolean;
  mods: ModpackMod[];
  created_at: string;
  updated_at: string;
  share_code: null | string;
  image_path: null | string;
  description: null | string;
  owner_address: null | string;
}

export interface SyncStatus {
  is_synced: boolean;
  owner_online: boolean;
  local_mod_count: number;
  remote_mod_count: null | number;
}

export interface InstallProgress {
  stage: string;
  total: number;
  current: number;
  message: string;
}

export interface InstallStatus {
  installed: boolean;
  installing: boolean;
  loader: null | string;
  last_played: null | string;
  loader_version: null | string;
  game_version: null | string;
  progress: null | InstallProgress;
}

export interface DetectedMod {
  name: string;
  mod_id: string;
  author: string;
  version: string;
  filename: string;
  modrinth_slug: null | string;
  modrinth_title: null | string;
  modrinth_icon_url: null | string;
  modrinth_project_id: null | string;
}

export interface ModUpdateInfo {
  full_name: string;
  display_name: string;
  current_version: string;
  latest_version: string;
  download_url: string;
  dependencies: string[];
  icon_url: null | string;
  enabled: boolean;
  position: number;
}

export interface UpdateCheckResult {
  available_updates: ModUpdateInfo[];
  mods_checked: number;
  check_errors: [string, string][];
}

export interface UpdateResult {
  full_name: string;
  from_version: string;
  to_version: string;
  success: boolean;
  error: null | string;
}

export interface BatchUpdateResult {
  results: UpdateResult[];
  success_count: number;
  failure_count: number;
}

export interface SyncProgress {
  current: number;
  total: number;
  mod_name: string;
  action: string;
}

export interface SyncResult {
  mods_added: string[];
  mods_removed: string[];
  mods_updated: string[];
  mods_toggled: string[];
  errors: SyncError[];
}

export interface SyncError {
  mod_slug: string;
  action: string;
  message: string;
}
