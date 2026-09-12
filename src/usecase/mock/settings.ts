import type { AppSettings, UserProfile } from '~/domain/interfaces/settings.interface';

import { GameId } from '~/domain/enums/provider.enum';

export const USER: UserProfile = {
  name: 'Frenvius',
  handle: 'frenvius',
  avatarColor: '#1bd96a',
  email: 'frenvius@gmail.com'
};

export const SETTINGS: AppSettings = {
  theme: 'dark',
  accentHue: 152,
  language: 'en-US',
  closeToTray: true,
  launchOnStartup: false,
  gamePaths: [
    { detected: true, gameId: GameId.Minecraft, path: 'C:\\Users\\frenv\\AppData\\Roaming\\.minecraft' },
    { detected: true, gameId: GameId.Valheim, path: 'D:\\SteamLibrary\\steamapps\\common\\Valheim' },
    { detected: true, gameId: GameId.VintageStory, path: 'C:\\Users\\frenv\\AppData\\Roaming\\Vintagestory' },
    { detected: true, gameId: GameId.RiskOfRain2, path: 'D:\\SteamLibrary\\steamapps\\common\\Risk of Rain 2' },
    { path: '', detected: false, gameId: GameId.LethalCompany }
  ]
};
