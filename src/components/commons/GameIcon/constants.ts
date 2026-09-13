import type { LucideIcon } from 'lucide-react';

import { Axe, Leaf, Ghost, Pickaxe } from 'lucide-react';

import { GameId } from '~/domain/enums/provider.enum';

export const GAME_ICONS: Record<GameId, LucideIcon> = {
  [GameId.Valheim]: Axe,
  [GameId.Minecraft]: Pickaxe,
  [GameId.VintageStory]: Leaf,
  [GameId.LethalCompany]: Ghost
};

export const GAME_ICON_SIZES = {
  sm: 'size-5 rounded-sm [&>svg]:size-3',
  md: 'size-8 rounded-md [&>svg]:size-4',
  lg: 'size-12 rounded-lg [&>svg]:size-6'
};
