import type { GameId, LoaderId, ProviderId, ProjectType, UpdateStatus } from '~/domain/enums/provider.enum';

export interface InstalledMod {
  name: string;
  author: string;
  enabled: boolean;
  type: ProjectType;
  projectId: string;
  iconColor: string;
  provider: ProviderId;
  status: UpdateStatus;
  installedVersion: string;
  missingDependency?: string;
  latestCompatibleVersion: string;
}

export interface ConfigFile {
  path: string;
  size: number;
  format: 'cfg' | 'json' | 'toml' | 'yaml' | 'properties';
  modifiedAt: string;
}

export interface LogLine {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
}

export interface InstanceModpackRef {
  modpackId: string;
  version: string;
}

export interface Instance {
  id: string;
  name: string;
  icon: string;
  gameId: GameId;
  loader: LoaderId;
  createdAt: string;
  iconColor: string;
  updatedAt: string;
  lastPlayed: string | null;
  description: string;
  gameVersion: string;
  logs: Array<LogLine>;
  loaderVersion: string;
  mods: Array<InstalledMod>;
  playtimeMinutes: number;
  configs: Array<ConfigFile>;
  modpack?: InstanceModpackRef;
  memoryMb: number;
  javaArgs?: string;
}

export interface CreateInstanceInput {
  name: string;
  icon: string;
  gameId: GameId;
  loader: LoaderId;
  iconColor: string;
  gameVersion: string;
}
