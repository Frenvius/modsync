import type { GameId } from '~/domain/enums/provider.enum';

export type LaunchMode = 'steam' | 'direct';

export interface GamePathSetting {
  path: string;
  gameId: GameId;
  detected: boolean;
  launchMode: LaunchMode;
}

export interface AppSettings {
  schemaVersion: 1;
  gamePaths: Array<GamePathSetting>;
}
