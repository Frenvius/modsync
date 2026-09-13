import type { ConfigFile } from '~/domain/interfaces/instance.interface';

import { invoke, isTauri } from '@tauri-apps/api/core';

class Service {
  async list(instanceId: string): Promise<Array<ConfigFile>> {
    if (!isTauri()) return [];
    return invoke<Array<ConfigFile>>('list_config_files', { instanceId });
  }

  async read(instanceId: string, path: string): Promise<string> {
    if (!isTauri()) throw new Error('Configuration editing is available in the desktop app');
    return invoke<string>('read_config_file', { path, instanceId });
  }

  async write(instanceId: string, path: string, content: string): Promise<ConfigFile> {
    if (!isTauri()) throw new Error('Configuration editing is available in the desktop app');
    return invoke<ConfigFile>('write_config_file', { path, content, instanceId });
  }

  async directory(instanceId: string): Promise<string> {
    if (!isTauri()) throw new Error('Configuration files are available in the desktop app');
    return invoke<string>('config_directory', { instanceId });
  }
}

export const configurationService = new Service();
