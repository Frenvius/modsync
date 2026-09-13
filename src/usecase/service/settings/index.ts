import type { AppSettings } from '~/domain/interfaces/settings.interface';

import { invoke, isTauri } from '@tauri-apps/api/core';

import { GameId } from '~/domain/enums/provider.enum';

const STORAGE_KEY = 'modsync.settings.v1';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentHue: 152,
  schemaVersion: 1,
  language: 'en-US',
  closeToTray: true,
  launchOnStartup: false,
  gamePaths: [
    { path: '', detected: false, gameId: GameId.Minecraft },
    { path: '', detected: false, gameId: GameId.Valheim },
    { path: '', detected: false, gameId: GameId.VintageStory },
    { path: '', detected: false, gameId: GameId.LethalCompany }
  ]
};

class Service {
  private saveQueue: Promise<void> = Promise.resolve();

  async get(): Promise<AppSettings> {
    if (isTauri()) return invoke<AppSettings>('get_settings');
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as AppSettings) : DEFAULT_SETTINGS;
  }

  async save(settings: AppSettings): Promise<AppSettings> {
    const save = async () => {
      if (isTauri()) return invoke<AppSettings>('save_settings', { settings });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      return settings;
    };
    const pending = this.saveQueue.then(save);
    this.saveQueue = pending.then(
      () => undefined,
      () => undefined
    );
    return pending;
  }
}

export const settingsService = new Service();
