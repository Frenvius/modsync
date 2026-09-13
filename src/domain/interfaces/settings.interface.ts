import type { GameId } from '~/domain/enums/provider.enum';

export interface GamePathSetting {
  path: string;
  gameId: GameId;
  detected: boolean;
}

export interface AppSettings {
  schemaVersion: 1;
  language: string;
  accentHue: number;
  closeToTray: boolean;
  theme: 'dark' | 'system';
  launchOnStartup: boolean;
  gamePaths: Array<GamePathSetting>;
}
