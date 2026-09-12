import type { AppSettings, UserProfile } from '~/domain/interfaces/settings.interface';

import { GameId } from '~/domain/enums/provider.enum';

export const USER: UserProfile = {
  name: 'Frenvius',
  handle: 'frenvius',
  email: 'frenvius@gmail.com',
  avatarColor: '#1bd96a'
};

export const SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'en-US',
  accentHue: 152,
  launchOnStartup: false,
  closeToTray: true,
  gamePaths: [
    { gameId: GameId.Minecraft, path: 'C:\\Users\\frenv\\AppData\\Roaming\\.minecraft', detected: true },
    { gameId: GameId.Valheim, path: 'D:\\SteamLibrary\\steamapps\\common\\Valheim', detected: true },
    { gameId: GameId.VintageStory, path: 'C:\\Users\\frenv\\AppData\\Roaming\\Vintagestory', detected: true },
    { gameId: GameId.RiskOfRain2, path: 'D:\\SteamLibrary\\steamapps\\common\\Risk of Rain 2', detected: true },
    { gameId: GameId.LethalCompany, path: '', detected: false }
  ]
};
