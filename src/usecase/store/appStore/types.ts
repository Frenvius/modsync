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
  setSelectedGame: (gameId: GameId) => void;
  clearCompleted: (gameId?: GameId) => void;
  cancelDownload: (id: string) => Promise<void>;
  setCreateInstanceOpen: (open: boolean) => void;
  playInstance: (instanceId: string) => Promise<void>;
  deleteInstance: (instanceId: string) => Promise<void>;
  refreshContent: (instanceId: string) => Promise<void>;
  duplicateInstance: (instanceId: string) => Promise<Instance>;
  updateInstance: (input: UpdateInstanceInput) => Promise<Instance>;
  createInstance: (input: CreateInstanceInput) => Promise<Instance>;
  repairMod: (instanceId: string, projectId: string) => Promise<void>;
  importLocalMod: (instanceId: string, path: string) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  importInstance: (input: CreateInstanceInput, path: string) => Promise<Instance>;
  removeMods: (instanceId: string, projectIds: Array<string>) => Promise<Array<string>>;
  toggleMod: (instanceId: string, projectId: string, enabled: boolean) => Promise<void>;
  installMod: (instanceId: string, project: Project, options?: InstallOptions) => Promise<void>;
}
