import type { GameId, LoaderId, ProviderId } from '~/domain/enums/provider.enum';

export interface ModpackMod {
  name: string;
  pinned: boolean;
  version: string;
  projectId: string;
  iconColor: string;
  provider: ProviderId;
}

export interface ModpackRelease {
  date: string;
  version: string;
  changelog: string;
}

export interface Modpack {
  id: string;
  name: string;
  author: string;
  gameId: GameId;
  loader: LoaderId;
  version: string;
  shareCode: string;
  updatedAt: string;
  coverColor: string;
  description: string;
  gameVersion: string;
  mods: Array<ModpackMod>;
  releases: Array<ModpackRelease>;
  sourceInstanceId?: string;
}

export interface ShareLink {
  url: string;
  code: string;
  modpackId: string;
}
