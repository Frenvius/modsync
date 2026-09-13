import type { GameId } from '~/domain/enums/provider.enum';
import type { Project } from '~/domain/interfaces/project.interface';
import type { AppSettings } from '~/domain/interfaces/settings.interface';
import type { DownloadItem } from '~/domain/interfaces/download.interface';
import type { Instance, CreateInstanceInput } from '~/domain/interfaces/instance.interface';

export interface InstallOptions {
  version?: string;
  dependencies?: Array<string>;
}

export interface AppState {
  ready: boolean;
  settings: AppSettings;
  selectedGameId: GameId;
  instances: Array<Instance>;
  createInstanceOpen: boolean;
  hydrate: () => Promise<void>;
  downloads: Array<DownloadItem>;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  setSelectedGame: (gameId: GameId) => void;
  clearCompleted: (gameId?: GameId) => void;
  deleteInstance: (instanceId: string) => void;
  setCreateInstanceOpen: (open: boolean) => void;
  playInstance: (instanceId: string) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  renameInstance: (instanceId: string, name: string) => void;
  duplicateInstance: (instanceId: string) => Promise<Instance>;
  createInstance: (input: CreateInstanceInput) => Promise<Instance>;
  removeMods: (instanceId: string, projectIds: Array<string>) => void;
  updateMods: (instanceId: string, projectIds: Array<string>) => Promise<void>;
  toggleMod: (instanceId: string, projectId: string, enabled: boolean) => void;
  changeModVersion: (instanceId: string, projectId: string, version: string) => void;
  installMod: (instanceId: string, project: Project, options?: InstallOptions) => Promise<void>;
}
