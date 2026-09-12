import type { LucideIcon } from 'lucide-react';

import React from 'react';
import { Axe, Leaf, Ghost, Rocket, Pickaxe } from 'lucide-react';

import { cn } from '~/lib/utils';
import { GameId } from '~/domain/enums/provider.enum';
import { projectService } from '~/usecase/service/project';

interface GameIconProps {
  gameId: GameId;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const ICONS: Record<GameId, LucideIcon> = {
  [GameId.Minecraft]: Pickaxe,
  [GameId.Valheim]: Axe,
  [GameId.VintageStory]: Leaf,
  [GameId.RiskOfRain2]: Rocket,
  [GameId.LethalCompany]: Ghost
};

const SIZES = { sm: 'size-5 rounded-sm [&>svg]:size-3', md: 'size-8 rounded-md [&>svg]:size-4', lg: 'size-12 rounded-lg [&>svg]:size-6' };

const GameIcon = ({ gameId, size = 'md', className }: GameIconProps) => {
  const Icon = ICONS[gameId];
  const game = projectService.getGame(gameId);
  return (
    <span
      title={game.name}
      style={{ background: game.color }}
      className={cn('inline-flex shrink-0 items-center justify-center text-white shadow-sm', SIZES[size], className)}
    >
      <Icon strokeWidth={2.25} />
    </span>
  );
};

export default GameIcon;
