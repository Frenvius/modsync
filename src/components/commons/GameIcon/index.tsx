import type { GameIconProps } from './types';

import { cn } from '~/lib/utils';
import { projectService } from '~/usecase/service/project';

import { GAME_ICONS, GAME_ICON_SIZES } from './constants';

const GameIcon = ({ gameId, className, size = 'md' }: GameIconProps) => {
  const Icon = GAME_ICONS[gameId];
  const game = projectService.getGame(gameId);
  return (
    <span
      title={game.name}
      style={{ background: game.color }}
      className={cn('inline-flex shrink-0 items-center justify-center text-white shadow-sm', GAME_ICON_SIZES[size], className)}
    >
      <Icon strokeWidth={2.25} />
    </span>
  );
};

export default GameIcon;
