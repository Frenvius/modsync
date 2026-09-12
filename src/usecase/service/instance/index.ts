import type { Project } from '~/domain/interfaces/project.interface';
import type { Instance, InstalledMod, CreateInstanceInput } from '~/domain/interfaces/instance.interface';

import { GAMES } from '~/usecase/mock/games';
import { INSTANCES } from '~/usecase/mock/instances';
import { uid, wait } from '~/usecase/util/formatUtils';
import { UpdateStatus } from '~/domain/enums/provider.enum';

class Service {
  async list(): Promise<Array<Instance>> {
    await wait(150);
    return INSTANCES;
  }

  async create(input: CreateInstanceInput): Promise<Instance> {
    await wait(600);
    const game = GAMES.find((g) => g.id === input.gameId);
    const now = new Date().toISOString();
    return {
      ...input,
      mods: [],
      configs: [],
      createdAt: now,
      updatedAt: now,
      memoryMb: 4096,
      id: uid('inst'),
      lastPlayed: null,
      playtimeMinutes: 0,
      loaderVersion: 'latest',
      description: `${game?.name ?? 'Game'} ${input.gameVersion}`,
      logs: [{ level: 'info', timestamp: now, message: 'Instance created' }]
    };
  }

  async duplicate(source: Instance): Promise<Instance> {
    await wait(400);
    return {
      ...source,
      id: uid('inst'),
      lastPlayed: null,
      playtimeMinutes: 0,
      name: `${source.name} (copy)`,
      createdAt: new Date().toISOString()
    };
  }

  toInstalledMod(project: Project, version = project.latestVersion): InstalledMod {
    return {
      enabled: true,
      name: project.name,
      type: project.type,
      projectId: project.id,
      author: project.author,
      installedVersion: version,
      iconColor: project.iconColor,
      provider: project.provider.id,
      status: UpdateStatus.UpToDate,
      latestCompatibleVersion: project.latestVersion
    };
  }

  async play(instance: Instance): Promise<void> {
    await wait(800);
    void instance;
  }
}

export const instanceService = new Service();
