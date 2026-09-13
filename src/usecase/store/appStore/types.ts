import type { GameId } from '~/domain/enums/provider.enum';
import type { Game } from '~/domain/interfaces/game.interface';
import type { Project } from '~/domain/interfaces/project.interface';
import type { AppSettings } from '~/domain/interfaces/settings.interface';
import type { DownloadItem } from '~/domain/interfaces/download.interface';
import type { Instance, CreateInstanceInput, UpdateInstanceInput } from '~/domain/interfaces/instance.interface';

export interface InstallOptions {
  version?: string;
  dependencies?: Array<string>;
}

export interface AppState {
  ready: boolean;
  games: Array<Game>;
  settings: AppSettings;
  selectedGameId: GameId;
  loadError: null | string;
  instances: Array<Instance>;
  createInstanceOpen: boolean;
  hydrate: () => Promise<void>;
  downloads: Array<DownloadItem>;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  setSelectedGame: (gameId: GameId) => void;
  clearCompleted: (gameId?: GameId) => void;
  setCreateInstanceOpen: (open: boolean) => void;
  playInstance: (instanceId: string) => Promise<void>;
  deleteInstance: (instanceId: string) => Promise<void>;
  duplicateInstance: (instanceId: string) => Promise<Instance>;
  updateInstance: (input: UpdateInstanceInput) => Promise<Instance>;
  createInstance: (input: CreateInstanceInput) => Promise<Instance>;
  removeMods: (instanceId: string, projectIds: Array<string>) => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  updateMods: (instanceId: string, projectIds: Array<string>) => Promise<void>;
  toggleMod: (instanceId: string, projectId: string, enabled: boolean) => void;
  importInstance: (input: CreateInstanceInput, path: string) => Promise<Instance>;
  changeModVersion: (instanceId: string, projectId: string, version: string) => void;
  installMod: (instanceId: string, project: Project, options?: InstallOptions) => Promise<void>;
}
