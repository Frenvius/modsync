import type { GameId } from '~/domain/enums/provider.enum';
import type { Modpack } from '~/domain/interfaces/modpack.interface';
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
  modpacks: Array<Modpack>;
  instances: Array<Instance>;
  createInstanceOpen: boolean;
  hydrate: () => Promise<void>;
  downloads: Array<DownloadItem>;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  setSelectedGame: (gameId: GameId) => void;
  importModpack: (modpack: Modpack) => void;
  clearCompleted: (gameId?: GameId) => void;
  deleteModpack: (modpackId: string) => void;
  deleteInstance: (instanceId: string) => void;
  setCreateInstanceOpen: (open: boolean) => void;
  playInstance: (instanceId: string) => Promise<void>;
  cloneModpack: (modpackId: string) => Promise<Modpack>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  installModpack: (modpackId: string) => Promise<Instance>;
  renameInstance: (instanceId: string, name: string) => void;
  duplicateInstance: (instanceId: string) => Promise<Instance>;
  createInstance: (input: CreateInstanceInput) => Promise<Instance>;
  removeMods: (instanceId: string, projectIds: Array<string>) => void;
  createModpackFromInstance: (instanceId: string) => Promise<Modpack>;
  updateModpack: (modpackId: string, patch: Partial<Modpack>) => void;
  updateMods: (instanceId: string, projectIds: Array<string>) => Promise<void>;
  toggleMod: (instanceId: string, projectId: string, enabled: boolean) => void;
  changeModVersion: (instanceId: string, projectId: string, version: string) => void;
  installMod: (instanceId: string, project: Project, options?: InstallOptions) => Promise<void>;
  createEmptyModpack: (input: Pick<Modpack, 'name' | 'gameId' | 'loader' | 'gameVersion' | 'description'>) => Promise<Modpack>;
}
