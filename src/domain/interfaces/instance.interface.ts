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
  modifiedAt: string;
  format: 'cfg' | 'json' | 'toml' | 'yaml' | 'properties';
}

export interface LogLine {
  message: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
}

export interface Instance {
  id: string;
  name: string;
  icon: string;
  gameId: GameId;
  loader: LoaderId;
  memoryMb: number;
  createdAt: string;
  iconColor: string;
  updatedAt: string;
  javaArgs?: string;
  description: string;
  gameVersion: string;
  logs: Array<LogLine>;
  loaderVersion: string;
  playtimeMinutes: number;
  lastPlayed: null | string;
  mods: Array<InstalledMod>;
  configs: Array<ConfigFile>;
}

export interface InstanceLocation {
  path: string;
  kind: 'managed' | 'external';
}

export interface InstanceManifest {
  id: string;
  name: string;
  icon: string;
  gameId: GameId;
  loader: LoaderId;
  memoryMb: number;
  schemaVersion: 1;
  createdAt: string;
  iconColor: string;
  updatedAt: string;
  javaArgs?: string;
  description: string;
  gameVersion: string;
  loaderVersion: string;
  playtimeMinutes: number;
  lastPlayed: null | string;
  mods: Array<InstalledMod>;
  location: InstanceLocation;
}

export interface CreateInstanceInput {
  name: string;
  icon: string;
  gameId: GameId;
  loader: LoaderId;
  iconColor: string;
  gameVersion: string;
}
