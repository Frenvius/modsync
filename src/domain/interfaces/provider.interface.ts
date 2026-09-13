import type { GameId, ProviderId } from '~/domain/enums/provider.enum';
export interface ProviderMeta {
  name: string;
  color: string;
  id: ProviderId;
  website: string;
  games: Array<GameId>;
  requiresApiKey: boolean;
}

export interface ProviderCategories {
  stale: boolean;
  items: Array<string>;
}
