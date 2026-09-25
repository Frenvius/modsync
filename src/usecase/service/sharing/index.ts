import type { InstanceManifest } from '~/domain/interfaces/instance.interface';
import type { SharingStatus, SharingProgress } from '~/domain/interfaces/sharing.interface';

import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';

const requireDesktop = () => {
  if (!isTauri()) throw new Error('Friend sharing requires the ModSync desktop app.');
};

const invokeWithProgress = async (
  command: string,
  input: object,
  operationId: string,
  onProgress: (progress: SharingProgress) => void
): Promise<InstanceManifest> => {
  const unlisten = await listen<SharingProgress>('operation-progress', ({ payload }) => {
    if (payload.operationId === operationId) onProgress(payload);
  });
  try {
    return await invoke<InstanceManifest>(command, { input });
  } finally {
    unlisten();
  }
};

class Service {
  async cancel(operationId: string): Promise<void> {
    requireDesktop();
    await invoke('cancel_operation', { operationId });
  }

  async status(): Promise<SharingStatus> {
    requireDesktop();
    return invoke<SharingStatus>('get_sharing_status');
  }

  async start(instanceId: string): Promise<SharingStatus> {
    requireDesktop();
    return invoke<SharingStatus>('start_sharing', { instanceId });
  }

  async ownerOnline(instanceId: string): Promise<boolean> {
    requireDesktop();
    return invoke<boolean>('check_owner_online', { instanceId });
  }

  async stop(instanceId: string): Promise<void> {
    requireDesktop();
    await invoke('stop_sharing', { instanceId });
  }

  async join(code: string, operationId: string, onProgress: (progress: SharingProgress) => void): Promise<InstanceManifest> {
    requireDesktop();
    return invokeWithProgress('join_shared_instance', { code, operationId }, operationId, onProgress);
  }

  async sync(
    instanceId: string,
    operationId: string,
    onProgress: (progress: SharingProgress) => void
  ): Promise<InstanceManifest> {
    requireDesktop();
    return invokeWithProgress('sync_joined_instance', { instanceId, operationId }, operationId, onProgress);
  }
}

export const sharingService = new Service();
