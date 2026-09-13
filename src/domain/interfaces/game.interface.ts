import type { GameId, LoaderId, ProviderId, ProjectType } from '~/domain/enums/provider.enum';

export interface GameLoader {
  id: LoaderId;
  name: string;
  recommended?: boolean;
}

export interface GameCapabilities {
  launch: boolean;
  update: boolean;
  install: boolean;
  importInstance: boolean;
}

export interface Game {
  id: GameId;
  name: string;
  color: string;
  ecosystemLabel: string;
  versions: Array<string>;
  loaders: Array<GameLoader>;
  providers: Array<ProviderId>;
  capabilities: GameCapabilities;
  contentTypes: Array<ProjectType>;
}
