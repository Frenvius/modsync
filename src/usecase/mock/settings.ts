import type { AppSettings } from '~/domain/interfaces/settings.interface';

import { GameId } from '~/domain/enums/provider.enum';

export const SETTINGS: AppSettings = {
  theme: 'dark',
  accentHue: 152,
  schemaVersion: 1,
  language: 'en-US',
  closeToTray: true,
  launchOnStartup: false,
  gamePaths: [
    { detected: true, gameId: GameId.Minecraft, path: 'C:\\Users\\frenv\\AppData\\Roaming\\.minecraft' },
    { detected: true, gameId: GameId.Valheim, path: 'D:\\SteamLibrary\\steamapps\\common\\Valheim' },
    { detected: true, gameId: GameId.VintageStory, path: 'C:\\Users\\frenv\\AppData\\Roaming\\Vintagestory' },
    { path: '', detected: false, gameId: GameId.LethalCompany }
  ]
};
