import type { UpdaterState } from './types';

import { create } from 'zustand';

import { updaterService } from '~/usecase/service/updater';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';

const NO_PROGRESS = { total: 0, downloaded: 0 };

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  error: null,
  update: null,
  status: 'idle',
  progress: NO_PROGRESS,

  dismiss: () => set({ error: null, status: 'idle' }),

  install: async () => {
    set({ error: null, status: 'downloading', progress: NO_PROGRESS });
    try {
      await updaterService.install((progress) => set({ progress }));
    } catch (error) {
      set({ status: 'error', error: getErrorMessage(error, 'Could not install the update.') });
    }
  },

  check: async () => {
    if (['checking', 'downloading'].includes(get().status)) return get().status;
    set({ error: null, status: 'checking' });
    try {
      const update = await updaterService.check();
      const status = update ? 'available' : 'up-to-date';
      set({ update, status });
      return status;
    } catch (error) {
      set({ update: null, status: 'error', error: getErrorMessage(error, 'Could not check for updates.') });
      return 'error';
    }
  }
}));
