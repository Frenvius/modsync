import type { AppState } from './types';
import type { Instance } from '~/domain/interfaces/instance.interface';
import type { DownloadItem } from '~/domain/interfaces/download.interface';

import { create } from 'zustand';

import { GAMES } from '~/usecase/mock/games';
import { PROJECTS } from '~/usecase/mock/projects';
import { DOWNLOADS } from '~/usecase/mock/downloads';
import { uid, wait } from '~/usecase/util/formatUtils';
import { catalogService } from '~/usecase/service/catalog';
import { projectService } from '~/usecase/service/project';
import { instanceService } from '~/usecase/service/instance';
import { providerService } from '~/usecase/service/providers';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { settingsService, DEFAULT_SETTINGS } from '~/usecase/service/settings';
import { GameId, DownloadKind, UpdateStatus, DownloadStatus } from '~/domain/enums/provider.enum';

const patchInstance = (instances: Array<Instance>, id: string, fn: (i: Instance) => Instance) =>
  instances.map((i) => (i.id === id ? fn({ ...i, updatedAt: new Date().toISOString() }) : i));

const newDownload = (partial: Pick<DownloadItem, 'kind' | 'title' | 'gameId' | 'subtitle' | 'instanceId'>): DownloadItem => ({
  ...partial,
  progress: 0,
  id: uid('dl'),
  etaSeconds: 2,
  step: 'Downloading file',
  status: DownloadStatus.Active,
  startedAt: new Date().toISOString(),
  totalBytes: 800_000 + Math.round(Math.random() * 6_000_000),
  bytesPerSecond: 4_000_000 + Math.round(Math.random() * 6_000_000)
});

const finishDownload = (d: DownloadItem): DownloadItem => ({
  ...d,
  step: 'Done',
  progress: 100,
  etaSeconds: 0,
  bytesPerSecond: 0,
  status: DownloadStatus.Completed
});

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  games: GAMES,
  instances: [],
  loadError: null,
  downloads: DOWNLOADS,
  createInstanceOpen: false,
  settings: DEFAULT_SETTINGS,
  selectedGameId: GameId.Minecraft,

  setSelectedGame: (selectedGameId) => set({ selectedGameId }),

  setCreateInstanceOpen: (createInstanceOpen) => set({ createInstanceOpen }),

  deleteInstance: async (instanceId) => {
    await instanceService.delete(instanceId);
    set((s) => ({ instances: s.instances.filter((i) => i.id !== instanceId) }));
  },

  cancelDownload: (id) =>
    set((s) => ({
      downloads: s.downloads.map((d) => (d.id === id ? { ...d, bytesPerSecond: 0, status: DownloadStatus.Cancelled } : d))
    })),

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

  pauseDownload: (id) =>
    set((s) => ({
      downloads: s.downloads.map((d) =>
        d.id === id ? { ...d, etaSeconds: 0, bytesPerSecond: 0, status: DownloadStatus.Paused } : d
      )
    })),

  resumeDownload: (id) =>
    set((s) => ({
      downloads: s.downloads.map((d) =>
        d.id === id ? { ...d, etaSeconds: 3, bytesPerSecond: 6_000_000, status: DownloadStatus.Active } : d
      )
    })),

  removeMods: (instanceId, projectIds) =>
    set((s) => ({
      instances: patchInstance(s.instances, instanceId, (i) => ({
        ...i,
        mods: i.mods.filter((m) => !projectIds.includes(m.projectId))
      }))
    })),

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

  changeModVersion: (instanceId, projectId, version) =>
    set((s) => ({
      instances: patchInstance(s.instances, instanceId, (i) => ({
        ...i,
        mods: i.mods.map((m) =>
          m.projectId === projectId
            ? {
                ...m,
                installedVersion: version,
                status: version === m.latestCompatibleVersion ? UpdateStatus.UpToDate : UpdateStatus.UpdateAvailable
              }
            : m
        )
      }))
    })),

  playInstance: async (instanceId) => {
    const instance = get().instances.find((i) => i.id === instanceId);
    if (!instance) return;
    await instanceService.play(instance);
    set((s) => ({
      instances: patchInstance(s.instances, instanceId, (i) => ({
        ...i,
        lastPlayed: new Date().toISOString(),
        playtimeMinutes: i.playtimeMinutes + 1,
        logs: [{ level: 'info', message: 'Game process started', timestamp: new Date().toISOString() }, ...i.logs]
      }))
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

  toggleMod: (instanceId, projectId, enabled) =>
    set((s) => ({
      instances: patchInstance(s.instances, instanceId, (i) => ({
        ...i,
        mods: i.mods.map((m) => {
          if (m.projectId !== projectId) return m;
          const healthy = m.status === UpdateStatus.UpToDate || m.status === UpdateStatus.UpdateAvailable;
          const enabledStatus =
            m.installedVersion === m.latestCompatibleVersion ? UpdateStatus.UpToDate : UpdateStatus.UpdateAvailable;
          if (!enabled) return { ...m, enabled, status: healthy ? UpdateStatus.Disabled : m.status };
          return { ...m, enabled, status: m.status === UpdateStatus.Disabled ? enabledStatus : m.status };
        })
      }))
    })),

  updateMods: async (instanceId, projectIds) => {
    const instance = get().instances.find((i) => i.id === instanceId);
    if (!instance) return;
    const mods = instance.mods.filter((m) => projectIds.includes(m.projectId) && m.status === UpdateStatus.UpdateAvailable);
    if (mods.length === 0) return;
    const downloads = mods.map((m) =>
      newDownload({
        instanceId,
        gameId: instance.gameId,
        subtitle: instance.name,
        kind: DownloadKind.UpdateMod,
        title: `${m.name} ${m.latestCompatibleVersion}`
      })
    );
    set((s) => ({ downloads: [...downloads, ...s.downloads] }));
    await wait(900);
    set((s) => ({
      downloads: s.downloads.map((d) => (downloads.some((n) => n.id === d.id) ? finishDownload(d) : d)),
      instances: patchInstance(s.instances, instanceId, (i) => ({
        ...i,
        mods: i.mods.map((m) =>
          projectIds.includes(m.projectId) && m.status === UpdateStatus.UpdateAvailable
            ? { ...m, status: UpdateStatus.UpToDate, installedVersion: m.latestCompatibleVersion }
            : m
        )
      }))
    }));
  },

  installMod: async (instanceId, project, options = {}) => {
    const instance = get().instances.find((i) => i.id === instanceId);
    if (!instance) return;
    const depProjects = (options.dependencies ?? [])
      .map((id) => PROJECTS.find((p) => p.id === id))
      .filter((p) => p !== undefined);
    const targets = [...depProjects, project].filter((p) => !instance.mods.some((m) => m.projectId === p.id));
    const downloads = targets.map((p) =>
      newDownload({
        instanceId,
        gameId: instance.gameId,
        subtitle: instance.name,
        kind: DownloadKind.InstallMod,
        title: `${p.name} ${p.latestVersion}`
      })
    );
    set((s) => ({ downloads: [...downloads, ...s.downloads] }));
    await wait(900);
    set((s) => ({
      downloads: s.downloads.map((d) => (downloads.some((n) => n.id === d.id) ? finishDownload(d) : d)),
      instances: patchInstance(s.instances, instanceId, (i) => ({
        ...i,
        mods: [
          ...i.mods.map((m) =>
            m.status === UpdateStatus.DependencyMissing && targets.some((t) => t.name === m.missingDependency)
              ? { ...m, missingDependency: undefined, status: UpdateStatus.UpToDate }
              : m
          ),
          ...targets.map((p) => instanceService.toInstalledMod(p, p.id === project.id ? options.version : undefined))
        ]
      }))
    }));
  }
}));

export const useInstance = (instanceId: string | undefined) => useAppStore((s) => s.instances.find((i) => i.id === instanceId));
