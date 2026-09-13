import type {
  Instance,
  InstanceManifest,
  CreateInstanceInput,
  UpdateInstanceInput
} from '~/domain/interfaces/instance.interface';

import { invoke, isTauri } from '@tauri-apps/api/core';

import { uid } from '~/usecase/util/formatUtils';
import { launchService } from '~/usecase/service/launch';
import { filesystemService } from '~/usecase/service/filesystem';

const STORAGE_KEY = 'modsync.instances.v1';

const toInstance = (manifest: InstanceManifest): Instance => ({ ...manifest, logs: [], configs: [] });
const toManifest = ({ logs: _logs, configs: _configs, ...manifest }: Instance): InstanceManifest => manifest;

class Service {
  fromManifest(manifest: InstanceManifest): Instance {
    return toInstance(manifest);
  }

  async list(): Promise<Array<Instance>> {
    if (!isTauri()) return this.readBrowserInstances();
    return (await invoke<Array<InstanceManifest>>('list_instances')).map(toInstance);
  }

  async create(input: CreateInstanceInput): Promise<Instance> {
    if (isTauri()) return toInstance(await invoke<InstanceManifest>('create_instance', { input }));
    const now = new Date().toISOString();
    const instance: Instance = {
      ...input,
      mods: [],
      logs: [],
      configs: [],
      createdAt: now,
      updatedAt: now,
      memoryMb: 4096,
      id: uid('inst'),
      lastPlayed: null,
      schemaVersion: 1,
      playtimeMinutes: 0,
      loaderVersion: 'latest',
      location: { path: '', kind: 'managed' },
      description: `${input.gameId} ${input.gameVersion}`
    };
    this.writeBrowserInstances([instance, ...this.readBrowserInstances()]);
    return instance;
  }

  async import(input: CreateInstanceInput, path: string): Promise<Instance> {
    if (!isTauri()) throw new Error('Folder import is available in the desktop app');
    return toInstance(await invoke<InstanceManifest>('import_instance', { input: { ...input, path } }));
  }

  async update(input: UpdateInstanceInput): Promise<Instance> {
    if (isTauri()) return toInstance(await invoke<InstanceManifest>('update_instance', { input }));
    const instances = this.readBrowserInstances();
    const current = instances.find((instance) => instance.id === input.id);
    if (!current) throw new Error('Instance not found');
    const updated: Instance = {
      ...current,
      name: input.name,
      memoryMb: input.memoryMb,
      updatedAt: new Date().toISOString(),
      javaArgs: input.javaArgs || undefined
    };
    this.writeBrowserInstances(instances.map((instance) => (instance.id === input.id ? updated : instance)));
    return updated;
  }

  async duplicate(id: string): Promise<Instance> {
    if (isTauri()) return toInstance(await invoke<InstanceManifest>('duplicate_instance', { id }));
    const source = this.readBrowserInstances().find((instance) => instance.id === id);
    if (!source) throw new Error('Instance not found');
    return this.create({
      icon: source.icon,
      loader: source.loader,
      gameId: source.gameId,
      iconColor: source.iconColor,
      name: `${source.name} (copy)`,
      gameVersion: source.gameVersion
    });
  }

  async delete(id: string): Promise<void> {
    if (isTauri()) return invoke('delete_instance', { id });
    this.writeBrowserInstances(this.readBrowserInstances().filter((instance) => instance.id !== id));
  }

  async openFolder(instance: Instance): Promise<void> {
    await filesystemService.openDirectory(instance.location.path);
  }

  async play(instance: Instance): Promise<Instance> {
    return toInstance(await launchService.launch(instance.id));
  }

  private readBrowserInstances(): Array<Instance> {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as Array<InstanceManifest>).map(toInstance) : [];
  }

  private writeBrowserInstances(instances: Array<Instance>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(instances.map(toManifest)));
  }
}

export const instanceService = new Service();
