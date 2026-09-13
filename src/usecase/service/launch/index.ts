import type { UnlistenFn } from '@tauri-apps/api/event';
import type { LogLine, InstanceManifest } from '~/domain/interfaces/instance.interface';

import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';

export interface JavaRuntime {
  path: string;
  version: string;
  majorVersion: number;
}

interface LaunchLogEvent {
  line: LogLine;
  instanceId: string;
}

class Service {
  async launch(instanceId: string): Promise<InstanceManifest> {
    if (!isTauri()) throw new Error('Games can only be launched from the desktop app');
    return invoke<InstanceManifest>('launch_instance', { instanceId });
  }

  async logs(instanceId: string): Promise<Array<LogLine>> {
    if (!isTauri()) return [];
    return invoke<Array<LogLine>>('list_process_logs', { instanceId });
  }

  async logsDirectory(instanceId: string): Promise<string> {
    if (!isTauri()) throw new Error('Process logs are available in the desktop app');
    return invoke<string>('logs_directory', { instanceId });
  }

  async javaRuntimes(): Promise<Array<JavaRuntime>> {
    if (!isTauri()) return [];
    return invoke<Array<JavaRuntime>>('list_java_runtimes');
  }

  async onLog(instanceId: string, callback: (line: LogLine) => void): Promise<UnlistenFn> {
    if (!isTauri()) return () => undefined;
    return listen<LaunchLogEvent>('launch-log', ({ payload }) => {
      if (payload.instanceId === instanceId) callback(payload.line);
    });
  }
}

export const launchService = new Service();
