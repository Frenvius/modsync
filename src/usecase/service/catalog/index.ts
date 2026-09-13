import type { Game } from '~/domain/interfaces/game.interface';
import type { ProviderMeta } from '~/domain/interfaces/provider.interface';

import { invoke, isTauri } from '@tauri-apps/api/core';

import { GAMES, PROVIDERS } from '~/usecase/mock/games';

export interface Catalog {
  games: Array<Game>;
  providers: Array<ProviderMeta>;
}

class Service {
  async get(): Promise<Catalog> {
    if (isTauri()) return invoke<Catalog>('get_catalog');
    return { games: GAMES, providers: PROVIDERS };
  }
}

export const catalogService = new Service();
