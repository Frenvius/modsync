import type { AppState } from './types';
import type { DownloadItem } from '~/domain/interfaces/download.interface';

import { create } from 'zustand';

import { GAMES } from '~/domain/data/catalog';
import { uid } from '~/usecase/util/formatUtils';
import { catalogService } from '~/usecase/service/catalog';
import { projectService } from '~/usecase/service/project';
import { instanceService } from '~/usecase/service/instance';
import { providerService } from '~/usecase/service/providers';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { settingsService, DEFAULT_SETTINGS } from '~/usecase/service/settings';
import { contentService, type OperationProgress } from '~/usecase/service/content';
import { GameId, ProviderId, DownloadKind, DownloadStatus } from '~/domain/enums/provider.enum';

const newDownload = (
  id: string,
  partial: Pick<DownloadItem, 'kind' | 'title' | 'gameId' | 'subtitle' | 'instanceId'>
): DownloadItem => ({
  ...partial,
  id,
  progress: 0,
  etaSeconds: 0,
  totalBytes: 0,
  bytesPerSecond: 0,
  step: 'Waiting to install',
  status: DownloadStatus.Queued,
  startedAt: new Date().toISOString()
});

const failDownload = (download: DownloadItem, operationId: string, error: unknown, fallback: string): DownloadItem =>
  download.id !== operationId || download.status === DownloadStatus.Cancelled
    ? download
    : { ...download, status: DownloadStatus.Failed, step: getErrorMessage(error, fallback) };

const applyProgress = (download: DownloadItem, progress: OperationProgress): DownloadItem => {
  const status =
    progress.status === 'completed'
      ? DownloadStatus.Completed
      : progress.status === 'failed'
        ? DownloadStatus.Failed
        : progress.status === 'cancelled'
          ? DownloadStatus.Cancelled
          : progress.status === 'pending'
            ? DownloadStatus.Queued
            : DownloadStatus.Active;
  const totalBytes = progress.totalBytes || download.totalBytes;
  return {
    ...download,
    status,
    totalBytes,
    etaSeconds: 0,
    bytesPerSecond: 0,
    step: progress.message,
    progress:
      progress.status === 'completed' ? 100 : totalBytes > 0 ? Math.min(99, (progress.downloadedBytes / totalBytes) * 100) : 0
  };
};

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  games: GAMES,
  instances: [],
  downloads: [],
  loadError: null,
  createInstanceOpen: false,
  settings: DEFAULT_SETTINGS,
  selectedGameId: GameId.Minecraft,

  setSelectedGame: (selectedGameId) => set({ selectedGameId }),

  setCreateInstanceOpen: (createInstanceOpen) => set({ createInstanceOpen }),

  deleteInstance: async (instanceId) => {
    await instanceService.delete(instanceId);
    set((s) => ({ instances: s.instances.filter((i) => i.id !== instanceId) }));
  },

  createInstance: async (input) => {
    const instance = await instanceService.create(input);
    set((s) => ({ instances: [instance, ...s.instances] }));
    return instance;
  },

  duplicateInstance: async (instanceId) => {
    const copy = await instanceService.duplicate(instanceId);
    set((s) => ({ instances: [copy, ...s.instances] }));
    return copy;
  },

  importInstance: async (input, path) => {
    const instance = await instanceService.import(input, path);
    set((s) => ({ instances: [instance, ...s.instances] }));
    return instance;
  },

  clearCompleted: (gameId) =>
    set((s) => ({
      downloads: s.downloads.filter(
        (d) => (gameId && d.gameId !== gameId) || (d.status !== DownloadStatus.Completed && d.status !== DownloadStatus.Cancelled)
      )
    })),

  updateInstance: async (input) => {
    const instance = await instanceService.update(input);
    set((s) => ({ instances: s.instances.map((current) => (current.id === instance.id ? instance : current)) }));
    return instance;
  },

  cancelDownload: async (id) => {
    await contentService.cancel(id);
    set((state) => ({
      downloads: state.downloads.map((download) =>
        download.id === id ? { ...download, step: 'Cancellation requested', status: DownloadStatus.Cancelled } : download
      )
    }));
  },

  refreshContent: async (instanceId) => {
    const manifest = await contentService.refresh(instanceId);
    const instance = instanceService.fromManifest(manifest);
    set((state) => ({
      instances: state.instances.map((current) => (current.id === instance.id ? instance : current))
    }));
  },

  importLocalMod: async (instanceId, path) => {
    const manifest = await contentService.importLocal(instanceId, path);
    const instance = instanceService.fromManifest(manifest);
    set((state) => ({
      instances: state.instances.map((current) => (current.id === instance.id ? instance : current))
    }));
  },

  updateSettings: async (patch) => {
    const previous = get().settings;
    const settings = { ...previous, ...patch };
    set({ settings });
    try {
      return await settingsService.save(settings);
    } catch (error) {
      if (get().settings === settings) set({ settings: previous });
      throw error;
    }
  },

  checkUpdates: async (instanceId) => {
    const result = await contentService.checkUpdates(instanceId);
    const instance = instanceService.fromManifest(result.instance);
    set((state) => ({
      instances: state.instances.map((current) => (current.id === instance.id ? instance : current))
    }));
    return result.items;
  },

  toggleMod: async (instanceId, projectId, enabled) => {
    const manifest = await contentService.setEnabled(instanceId, projectId, enabled);
    const instance = instanceService.fromManifest(manifest);
    set((state) => ({
      instances: state.instances.map((current) => (current.id === instance.id ? instance : current))
    }));
  },

  removeMods: async (instanceId, projectIds) => {
    const result = await contentService.remove(instanceId, projectIds);
    const instance = instanceService.fromManifest(result.instance);
    set((state) => ({
      instances: state.instances.map((current) => (current.id === instance.id ? instance : current))
    }));
    return result.warnings;
  },

  playInstance: async (instanceId) => {
    const instance = get().instances.find((candidate) => candidate.id === instanceId);
    if (!instance) throw new Error('Instance not found');
    const launched = await instanceService.play(instance);
    set((state) => ({
      instances: state.instances.map((current) =>
        current.id === launched.id ? { ...launched, logs: current.logs, configs: current.configs } : current
      )
    }));
  },

  hydrate: async () => {
    set({ ready: false, loadError: null });
    try {
      const [catalog, instances, settings] = await Promise.all([
        catalogService.get(),
        instanceService.list(),
        settingsService.get()
      ]);
      projectService.setGames(catalog.games);
      providerService.setProviders(catalog.providers);
      set({ settings, instances, ready: true, games: catalog.games });
    } catch (error) {
      set({ ready: true, loadError: getErrorMessage(error, 'Could not load ModSync data') });
    }
  },

  updateAllMods: async (instanceId) => {
    const instance = get().instances.find((candidate) => candidate.id === instanceId);
    if (!instance) throw new Error('Instance not found');
    const operationId = uid('update-all');
    const download = newDownload(operationId, {
      instanceId,
      gameId: instance.gameId,
      subtitle: instance.name,
      kind: DownloadKind.UpdateMod,
      title: `Update all content in ${instance.name}`
    });
    set((state) => ({ downloads: [download, ...state.downloads] }));
    try {
      const result = await contentService.updateAll(instanceId, operationId, (progress) =>
        set((state) => ({
          downloads: state.downloads.map((current) => (current.id === operationId ? applyProgress(current, progress) : current))
        }))
      );
      const updated = instanceService.fromManifest(result.instance);
      set((state) => ({
        instances: state.instances.map((current) => (current.id === updated.id ? updated : current))
      }));
      return result.items;
    } catch (error) {
      set((state) => ({
        downloads: state.downloads.map((current) => failDownload(current, operationId, error, 'Updates failed'))
      }));
      throw error;
    }
  },

  updateMod: async (instanceId, projectId, versionId) => {
    const instance = get().instances.find((candidate) => candidate.id === instanceId);
    const mod = instance?.mods.find((candidate) => candidate.projectId === projectId);
    if (!instance || !mod || mod.provider === ProviderId.Local) throw new Error('Installed content cannot be updated');
    const operationId = uid('update');
    const download = newDownload(operationId, {
      instanceId,
      gameId: instance.gameId,
      subtitle: instance.name,
      title: `Update ${mod.name}`,
      kind: DownloadKind.UpdateMod
    });
    set((state) => ({ downloads: [download, ...state.downloads] }));
    try {
      const manifest = await contentService.update(
        {
          projectId,
          versionId,
          instanceId,
          operationId,
          optionalDependencies: []
        },
        (progress) =>
          set((state) => ({
            downloads: state.downloads.map((current) => (current.id === operationId ? applyProgress(current, progress) : current))
          }))
      );
      const updated = instanceService.fromManifest(manifest);
      set((state) => ({
        instances: state.instances.map((current) => (current.id === updated.id ? updated : current))
      }));
    } catch (error) {
      set((state) => ({
        downloads: state.downloads.map((current) => failDownload(current, operationId, error, 'Update failed'))
      }));
      throw error;
    }
  },

  installMod: async (instanceId, project, options = {}) => {
    const instance = get().instances.find((candidate) => candidate.id === instanceId);
    if (!instance) throw new Error('Instance not found');
    const operationId = uid('install');
    const download = newDownload(operationId, {
      instanceId,
      gameId: instance.gameId,
      subtitle: instance.name,
      kind: DownloadKind.InstallMod,
      title: `${project.name} ${options.version ?? project.latestVersion}`
    });
    set((state) => ({ downloads: [download, ...state.downloads] }));
    let manifest: Awaited<ReturnType<typeof contentService.install>>;
    try {
      manifest = await contentService.install(
        {
          instanceId,
          operationId,
          projectId: project.id,
          versionId: options.version,
          optionalDependencies: options.dependencies ?? []
        },
        (progress) =>
          set((state) => ({
            downloads: state.downloads.map((current) => (current.id === operationId ? applyProgress(current, progress) : current))
          }))
      );
    } catch (error) {
      set((state) => ({
        downloads: state.downloads.map((current) => failDownload(current, operationId, error, 'Installation failed'))
      }));
      throw error;
    }
    const installed = instanceService.fromManifest(manifest);
    set((state) => ({
      instances: state.instances.map((current) => (current.id === installed.id ? installed : current))
    }));
  },

  repairMod: async (instanceId, projectId) => {
    const instance = get().instances.find((candidate) => candidate.id === instanceId);
    const mod = instance?.mods.find((candidate) => candidate.projectId === projectId);
    if (!instance || !mod || !mod.versionId) throw new Error('Installed content cannot be repaired');
    const operationId = uid('repair');
    const download = newDownload(operationId, {
      instanceId,
      gameId: instance.gameId,
      subtitle: instance.name,
      kind: DownloadKind.InstallMod,
      title: `Repair ${mod.name} ${mod.installedVersion}`
    });
    set((state) => ({ downloads: [download, ...state.downloads] }));
    let manifest: Awaited<ReturnType<typeof contentService.repair>>;
    try {
      manifest = await contentService.repair(
        {
          projectId,
          instanceId,
          operationId,
          versionId: mod.versionId,
          optionalDependencies: []
        },
        (progress) =>
          set((state) => ({
            downloads: state.downloads.map((current) => (current.id === operationId ? applyProgress(current, progress) : current))
          }))
      );
    } catch (error) {
      set((state) => ({
        downloads: state.downloads.map((current) => failDownload(current, operationId, error, 'Repair failed'))
      }));
      throw error;
    }
    const repaired = instanceService.fromManifest(manifest);
    set((state) => ({
      instances: state.instances.map((current) => (current.id === repaired.id ? repaired : current))
    }));
  }
}));

export const useInstance = (instanceId: string | undefined) => useAppStore((s) => s.instances.find((i) => i.id === instanceId));
