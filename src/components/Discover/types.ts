import type { Game } from '~/domain/interfaces/game.interface';
import type { Project } from '~/domain/interfaces/project.interface';
import type { Instance } from '~/domain/interfaces/instance.interface';
import type { LoaderId, ProviderId } from '~/domain/enums/provider.enum';

export interface DiscoverFilters {
  loader?: LoaderId;
  category?: string;
  gameVersion?: string;
  providers: Array<ProviderId>;
}

export interface FilterPopoverProps {
  game: Game;
  filters: DiscoverFilters;
  categories: Array<string>;
  onChange: (filters: DiscoverFilters) => void;
}

export interface FilterSelectProps {
  label: string;
  value?: string;
  options: Array<string>;
  onChange: (value: string | undefined) => void;
}

export interface ProjectDetailsPanelProps {
  project: Project;
  installed: boolean;
  installing: boolean;
  instance?: Instance;
  onClose: () => void;
  onInstall: () => void;
}
