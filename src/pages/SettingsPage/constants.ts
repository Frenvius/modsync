import type { LaunchMode } from '~/domain/interfaces/settings.interface';

import { GameId } from '~/domain/enums/provider.enum';

export const SETTINGS_SECTIONS = ['Games', 'Advanced', 'About'] as const;

export const STEAM_GAMES = [GameId.Valheim, GameId.LethalCompany];

export const LAUNCH_MODE_LABELS: Record<LaunchMode, string> = {
  steam: 'Steam',
  direct: 'Direct'
};
