import type { GameId, LoaderId, ProviderId, ProjectType, UpdateStatus } from '~/domain/enums/provider.enum';

export interface InstalledFile {
  path: string;
  sha512?: string;
  mutable: boolean;
}

export interface InstalledMod {
  name: string;
  author: string;
  enabled: boolean;
  iconUrl?: string;
  type: ProjectType;
  projectId: string;
  iconColor: string;
  versionId?: string;
  provider: ProviderId;
  status: UpdateStatus;
  updateAvailable: boolean;
  installedVersion: string;
  loaders: Array<LoaderId>;
  missingDependency?: string;
  dependencies: Array<string>;
  gameVersions: Array<string>;
  files?: Array<InstalledFile>;
  latestCompatibleVersion: string;
  installedVersionPublishedAt?: string;
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
  schemaVersion: 1;
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
  location: InstanceLocation;
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
  lastOperationId?: string;
  lastPlayed: null | string;
  mods: Array<InstalledMod>;
  location: InstanceLocation;
}

export interface UpdateInstanceInput {
  id: string;
  name: string;
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
