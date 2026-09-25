import type { Update } from '@tauri-apps/plugin-updater';
import type { UpdateProgress, AvailableUpdate } from '~/domain/interfaces/updater.interface';

import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';

export const RELEASES_URL = 'https://github.com/Frenvius/modsync/releases/latest';

class Service {
  private pending: null | Update = null;

  async currentVersion(): Promise<null | string> {
    return isTauri() ? getVersion() : null;
  }

  async check(): Promise<null | AvailableUpdate> {
    if (!isTauri()) return null;
    this.pending = await check();
    if (!this.pending) return null;
    return { version: this.pending.version, notes: this.pending.body ?? '', currentVersion: this.pending.currentVersion };
  }

  async install(onProgress: (progress: UpdateProgress) => void): Promise<void> {
    if (!this.pending) throw new Error('No update is ready to install.');
    // Windows installers exit the app on success; other platforms would need a relaunch here.
    let total = 0;
    let downloaded = 0;
    await this.pending.downloadAndInstall((event) => {
      if (event.event === 'Started') total = event.data.contentLength ?? 0;
      if (event.event === 'Progress') downloaded += event.data.chunkLength;
      onProgress({ total, downloaded });
    });
  }
}

export const updaterService = new Service();
