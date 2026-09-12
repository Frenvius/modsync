import type { GameId } from '~/domain/enums/provider.enum';

export interface GamePathSetting {
  path: string;
  gameId: GameId;
  detected: boolean;
}

export interface UserProfile {
  name: string;
  email: string;
  handle: string;
  avatarColor: string;
}

export interface AppSettings {
  theme: 'dark' | 'system';
  language: string;
  accentHue: number;
  launchOnStartup: boolean;
  closeToTray: boolean;
  gamePaths: Array<GamePathSetting>;
}
