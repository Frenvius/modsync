import type { UpdateProgress, AvailableUpdate } from '~/domain/interfaces/updater.interface';

export type UpdaterStatus = 'idle' | 'error' | 'checking' | 'available' | 'up-to-date' | 'downloading';

export interface UpdaterState {
  dismiss: () => void;
  error: null | string;
  status: UpdaterStatus;
  progress: UpdateProgress;
  install: () => Promise<void>;
  update: null | AvailableUpdate;
  check: () => Promise<UpdaterStatus>;
}
