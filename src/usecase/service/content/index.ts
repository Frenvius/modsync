import type { InstanceManifest } from '~/domain/interfaces/instance.interface';

import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';

export interface OperationProgress {
  message: string;
  totalItems: number;
  totalBytes: number;
  operationId: string;
  completedItems: number;
  downloadedBytes: number;
  status: 'failed' | 'pending' | 'running' | 'completed' | 'cancelled';
}

export interface UnmanagedContent {
  name: string;
  path: string;
  type: 'mod' | 'shader' | 'datapack' | 'resourcepack';
}

interface ContentMutationResult {
  warnings: Array<string>;
  instance: InstanceManifest;
}

export interface InstallPlanItem {
  name: string;
  version: string;
  projectId: string;
}

interface InstallContentInput {
  projectId: string;
  instanceId: string;
  versionId?: string;
  operationId: string;
  optionalDependencies: Array<string>;
}

const requireDesktop = () => {
  if (!isTauri()) throw new Error('Content installation requires the ModSync desktop app.');
};

export const contentService = {
  async cancel(operationId: string): Promise<void> {
    requireDesktop();
    await invoke('cancel_operation', { operationId });
  },

  async refresh(instanceId: string): Promise<InstanceManifest> {
    requireDesktop();
    return invoke<InstanceManifest>('refresh_content', { instanceId });
  },

  async listUnmanaged(instanceId: string): Promise<Array<UnmanagedContent>> {
    requireDesktop();
    return invoke<Array<UnmanagedContent>>('list_unmanaged_content', { instanceId });
  },

  async preview(input: Omit<InstallContentInput, 'operationId'>): Promise<Array<InstallPlanItem>> {
    requireDesktop();
    return invoke<Array<InstallPlanItem>>('preview_install', { input });
  },

  async importLocal(instanceId: string, path: string): Promise<InstanceManifest> {
    requireDesktop();
    return invoke<InstanceManifest>('import_local_content', { input: { path, instanceId } });
  },

  async remove(instanceId: string, projectIds: Array<string>): Promise<ContentMutationResult> {
    requireDesktop();
    return invoke<ContentMutationResult>('remove_content', { input: { instanceId, projectIds } });
  },

  async setEnabled(instanceId: string, projectId: string, enabled: boolean): Promise<InstanceManifest> {
    requireDesktop();
    return invoke<InstanceManifest>('set_content_enabled', { input: { enabled, projectId, instanceId } });
  },

  async repair(input: InstallContentInput, onProgress: (progress: OperationProgress) => void): Promise<InstanceManifest> {
    requireDesktop();
    const unlisten = await listen<OperationProgress>('operation-progress', ({ payload }) => {
      if (payload.operationId === input.operationId) onProgress(payload);
    });
    try {
      return await invoke<InstanceManifest>('repair_content', { input });
    } finally {
      unlisten();
    }
  },

  async install(input: InstallContentInput, onProgress: (progress: OperationProgress) => void): Promise<InstanceManifest> {
    requireDesktop();
    const unlisten = await listen<OperationProgress>('operation-progress', ({ payload }) => {
      if (payload.operationId === input.operationId) onProgress(payload);
    });
    try {
      return await invoke<InstanceManifest>('install_content', { input });
    } finally {
      unlisten();
    }
  }
};
