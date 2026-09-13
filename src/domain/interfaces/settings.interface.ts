import type { GameId } from '~/domain/enums/provider.enum';

export interface GamePathSetting {
  path: string;
  gameId: GameId;
  detected: boolean;
}

export interface AppSettings {
  schemaVersion: 1;
  gamePaths: Array<GamePathSetting>;
}
