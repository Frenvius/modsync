import type { Modpack } from '~/domain/interfaces/modpack.interface';
import type { Project } from '~/domain/interfaces/project.interface';
import type { DownloadItem } from '~/domain/interfaces/download.interface';
import type { AppSettings } from '~/domain/interfaces/settings.interface';
import type { Instance, CreateInstanceInput } from '~/domain/interfaces/instance.interface';
import type { GameId } from '~/domain/enums/provider.enum';

export interface InstallOptions {
  version?: string;
  dependencies?: Array<string>;
}

export interface AppState {
  ready: boolean;
  settings: AppSettings;
  selectedGameId: GameId;
  modpacks: Array<Modpack>;
  instances: Array<Instance>;
  downloads: Array<DownloadItem>;
  createInstanceOpen: boolean;
  hydrate: () => Promise<void>;
  setSelectedGame: (gameId: GameId) => void;
  setCreateInstanceOpen: (open: boolean) => void;
  createInstance: (input: CreateInstanceInput) => Promise<Instance>;
  duplicateInstance: (instanceId: string) => Promise<Instance>;
  deleteInstance: (instanceId: string) => void;
  renameInstance: (instanceId: string, name: string) => void;
  playInstance: (instanceId: string) => Promise<void>;
  installMod: (instanceId: string, project: Project, options?: InstallOptions) => Promise<void>;
  updateMods: (instanceId: string, projectIds: Array<string>) => Promise<void>;
  removeMods: (instanceId: string, projectIds: Array<string>) => void;
  toggleMod: (instanceId: string, projectId: string, enabled: boolean) => void;
  changeModVersion: (instanceId: string, projectId: string, version: string) => void;
  createModpackFromInstance: (instanceId: string) => Promise<Modpack>;
  createEmptyModpack: (input: Pick<Modpack, 'name' | 'gameId' | 'gameVersion' | 'loader' | 'description'>) => Promise<Modpack>;
  cloneModpack: (modpackId: string) => Promise<Modpack>;
  importModpack: (modpack: Modpack) => void;
  updateModpack: (modpackId: string, patch: Partial<Modpack>) => void;
  deleteModpack: (modpackId: string) => void;
  installModpack: (modpackId: string) => Promise<Instance>;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  clearCompleted: (gameId?: GameId) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}
