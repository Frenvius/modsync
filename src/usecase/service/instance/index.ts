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
      id: uid('inst'),
      description: `${game?.name ?? 'Game'} ${input.gameVersion}`,
      loaderVersion: 'latest',
      createdAt: now,
      updatedAt: now,
      lastPlayed: null,
      playtimeMinutes: 0,
      memoryMb: 4096,
      mods: [],
      configs: [],
      logs: [{ level: 'info', timestamp: now, message: 'Instance created' }]
    };
  }

  async duplicate(source: Instance): Promise<Instance> {
    await wait(400);
    return { ...source, id: uid('inst'), name: `${source.name} (copy)`, lastPlayed: null, playtimeMinutes: 0, createdAt: new Date().toISOString() };
  }

  toInstalledMod(project: Project, version = project.latestVersion): InstalledMod {
    return {
      name: project.name,
      type: project.type,
      author: project.author,
      enabled: true,
      projectId: project.id,
      iconColor: project.iconColor,
      provider: project.provider.id,
      status: UpdateStatus.UpToDate,
      installedVersion: version,
      latestCompatibleVersion: project.latestVersion
    };
  }

  async play(instance: Instance): Promise<void> {
    await wait(800);
    void instance;
  }
}

export const instanceService = new Service();
