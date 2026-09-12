import type { GameId } from '~/domain/enums/provider.enum';

export interface GameIconProps {
  gameId: GameId;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}
