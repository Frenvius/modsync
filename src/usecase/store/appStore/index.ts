import type { AppState } from './types';
import type { Instance } from '~/domain/interfaces/instance.interface';
import type { DownloadItem } from '~/domain/interfaces/download.interface';

import { create } from 'zustand';

import { PROJECTS } from '~/usecase/mock/projects';
import { DOWNLOADS } from '~/usecase/mock/downloads';
import { uid, wait } from '~/usecase/util/formatUtils';
import { USER, SETTINGS } from '~/usecase/mock/settings';
import { modpackService } from '~/usecase/service/modpack';
import { instanceService } from '~/usecase/service/instance';
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
  modpacks: [],
  instances: [],
  settings: SETTINGS,
  downloads: DOWNLOADS,
  createInstanceOpen: false,
  selectedGameId: GameId.Minecraft,

  setSelectedGame: (selectedGameId) => set({ selectedGameId }),

  setCreateInstanceOpen: (createInstanceOpen) => set({ createInstanceOpen }),

  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  deleteModpack: (modpackId) => set((s) => ({ modpacks: s.modpacks.filter((m) => m.id !== modpackId) })),

  deleteInstance: (instanceId) => set((s) => ({ instances: s.instances.filter((i) => i.id !== instanceId) })),

  renameInstance: (instanceId, name) =>
    set((s) => ({ instances: patchInstance(s.instances, instanceId, (i) => ({ ...i, name })) })),

  importModpack: (modpack) =>
    set((s) => (s.modpacks.some((m) => m.id === modpack.id) ? s : { modpacks: [modpack, ...s.modpacks] })),

  cancelDownload: (id) =>
    set((s) => ({
      downloads: s.downloads.map((d) => (d.id === id ? { ...d, bytesPerSecond: 0, status: DownloadStatus.Cancelled } : d))
    })),

  hydrate: async () => {
    const [instances, modpacks] = await Promise.all([instanceService.list(), modpackService.list()]);
    set({ modpacks, instances, ready: true });
  },

  createInstance: async (input) => {
    const instance = await instanceService.create(input);
    set((s) => ({ instances: [instance, ...s.instances] }));
    return instance;
  },

  updateModpack: (modpackId, patch) =>
    set((s) => ({
      modpacks: s.modpacks.map((m) => (m.id === modpackId ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m))
    })),

  createEmptyModpack: async (input) => {
    const modpack = await modpackService.createEmpty(input, USER.handle);
    set((s) => ({ modpacks: [modpack, ...s.modpacks] }));
    return modpack;
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

  cloneModpack: async (modpackId) => {
    const source = get().modpacks.find((m) => m.id === modpackId);
    if (!source) throw new Error('Modpack not found');
    const copy = await modpackService.clone(source, USER.handle);
    set((s) => ({ modpacks: [copy, ...s.modpacks] }));
    return copy;
  },

  duplicateInstance: async (instanceId) => {
    const source = get().instances.find((i) => i.id === instanceId);
    if (!source) throw new Error('Instance not found');
    const copy = await instanceService.duplicate(source);
    set((s) => ({ instances: [copy, ...s.instances] }));
    return copy;
  },

  createModpackFromInstance: async (instanceId) => {
    const instance = get().instances.find((i) => i.id === instanceId);
    if (!instance) throw new Error('Instance not found');
    const modpack = await modpackService.fromInstance(instance, USER.handle);
    set((s) => ({ modpacks: [modpack, ...s.modpacks] }));
    return modpack;
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

  installModpack: async (modpackId) => {
    const modpack = get().modpacks.find((m) => m.id === modpackId) ?? (await modpackService.resolveShared(modpackId));
    if (!modpack) throw new Error('Modpack not found');
    const download = newDownload({
      gameId: modpack.gameId,
      subtitle: 'Creating instance',
      kind: DownloadKind.InstallModpack,
      title: `${modpack.name} ${modpack.version}`
    });
    set((s) => ({ downloads: [{ ...download, step: 'Resolving mods' }, ...s.downloads] }));
    const instance = await instanceService.create({
      icon: 'package',
      name: modpack.name,
      gameId: modpack.gameId,
      loader: modpack.loader,
      iconColor: modpack.coverColor,
      gameVersion: modpack.gameVersion
    });
    const mods = modpack.mods
      .map((m) => PROJECTS.find((p) => p.id === m.projectId))
      .filter((p) => p !== undefined)
      .map((p) => instanceService.toInstalledMod(p, modpack.mods.find((m) => m.projectId === p.id)?.version));
    const created = {
      ...instance,
      mods,
      description: modpack.description,
      modpack: { modpackId: modpack.id, version: modpack.version }
    };
    set((s) => ({
      instances: [created, ...s.instances],
      downloads: s.downloads.map((d) => (d.id === download.id ? finishDownload(d) : d))
    }));
    return created;
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

export const useModpack = (modpackId: string | undefined) => useAppStore((s) => s.modpacks.find((m) => m.id === modpackId));
