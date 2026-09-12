import type { Project } from '~/domain/interfaces/project.interface';
import type { Dependency } from '~/domain/interfaces/project.interface';
import type { InstalledMod } from '~/domain/interfaces/instance.interface';

export interface ModRowHandlers {
  onUpdate: (projectId: string) => void;
  onRemove: (projectId: string) => void;
  onChangeVersion: (projectId: string) => void;
  onToggle: (projectId: string, enabled: boolean) => void;
}

export interface ModListItemProps {
  mod: InstalledMod;
  selected: boolean;
  handlers: ModRowHandlers;
  onSelect: (projectId: string, selected: boolean) => void;
}

export interface ModCardProps {
  project: Project;
  installed?: boolean;
  onInstall: (project: Project) => void;
}

export interface InstallDialogProps {
  open: boolean;
  version?: string;
  instanceId?: string;
  project: null | Project;
  onOpenChange: (open: boolean) => void;
}

export interface DependencyListProps {
  className?: string;
  installedIds?: Array<string>;
  dependencies: Array<Dependency>;
}
