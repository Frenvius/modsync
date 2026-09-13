import type { Game } from '~/domain/interfaces/game.interface';
import type { GameId, LoaderId } from '~/domain/enums/provider.enum';

export interface WizardDraft {
  name: string;
  icon: string;
  color: string;
  gameId?: GameId;
  loader?: LoaderId;
  gameVersion?: string;
}

export interface IdentityStepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

export interface LoaderStepProps {
  game: Game;
  value?: LoaderId;
  onChange: (loader: LoaderId) => void;
}

export interface VersionStepProps {
  game: Game;
  value?: string;
  onChange: (version: string) => void;
}

export interface SummaryProps {
  gameName: string;
  draft: WizardDraft;
}
