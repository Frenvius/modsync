import type { Instance } from '~/domain/interfaces/instance.interface';
import type { Modpack, ShareLink } from '~/domain/interfaces/modpack.interface';

import { MODPACKS } from '~/usecase/mock/modpacks';
import { uid, wait } from '~/usecase/util/formatUtils';

const SHARE_BASE = 'https://app.example/modpack/';

const shareCodeFor = (modpack: Pick<Modpack, 'gameId'>) => {
  const prefix = modpack.gameId.slice(0, 2).toUpperCase();
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
};

class Service {
  async list(): Promise<Array<Modpack>> {
    await wait(150);
    return MODPACKS;
  }

  async fromInstance(instance: Instance, author: string): Promise<Modpack> {
    await wait(500);
    const now = new Date().toISOString();
    const base = { gameId: instance.gameId };
    return {
      id: uid('pack'),
      name: instance.name,
      author,
      gameId: instance.gameId,
      gameVersion: instance.gameVersion,
      loader: instance.loader,
      version: '1.0.0',
      shareCode: shareCodeFor(base),
      coverColor: instance.iconColor,
      updatedAt: now,
      description: instance.description,
      sourceInstanceId: instance.id,
      mods: instance.mods
        .filter((m) => m.enabled)
        .map((m) => ({ name: m.name, pinned: false, version: m.installedVersion, provider: m.provider, projectId: m.projectId, iconColor: m.iconColor })),
      releases: [{ version: '1.0.0', date: now, changelog: `Exported from instance "${instance.name}".` }]
    };
  }

  async createEmpty(input: Pick<Modpack, 'name' | 'gameId' | 'gameVersion' | 'loader' | 'description'>, author: string): Promise<Modpack> {
    await wait(400);
    const now = new Date().toISOString();
    return {
      ...input,
      id: uid('pack'),
      author,
      version: '0.1.0',
      shareCode: shareCodeFor(input),
      coverColor: '#7a9cc6',
      updatedAt: now,
      mods: [],
      releases: [{ version: '0.1.0', date: now, changelog: 'Created.' }]
    };
  }

  async clone(source: Modpack, author: string): Promise<Modpack> {
    await wait(300);
    return { ...source, id: uid('pack'), author, name: `${source.name} (fork)`, shareCode: shareCodeFor(source), updatedAt: new Date().toISOString() };
  }

  async share(modpack: Modpack): Promise<ShareLink> {
    await wait(300);
    return { modpackId: modpack.id, code: modpack.shareCode, url: `${SHARE_BASE}${modpack.id}` };
  }

  async resolveShared(idOrCode: string): Promise<Modpack | undefined> {
    await wait(300);
    const key = idOrCode.toUpperCase();
    return MODPACKS.find((m) => m.id === idOrCode || m.shareCode === key);
  }

  exportToJson(modpack: Modpack): string {
    return JSON.stringify(modpack, null, 2);
  }
}

export const modpackService = new Service();
