import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';

class Service {
  async chooseDirectory(): Promise<null | string> {
    if (!isTauri()) throw new Error('Folder selection is available in the desktop app');
    return open({ directory: true, multiple: false });
  }

  async openDirectory(path: string): Promise<void> {
    if (!isTauri() || !path) throw new Error('Folders are available in the desktop app');
    await openPath(path);
  }
}

export const filesystemService = new Service();
