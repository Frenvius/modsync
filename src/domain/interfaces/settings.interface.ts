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
  language: string;
  accentHue: number;
  closeToTray: boolean;
  theme: 'dark' | 'system';
  launchOnStartup: boolean;
  gamePaths: Array<GamePathSetting>;
}
