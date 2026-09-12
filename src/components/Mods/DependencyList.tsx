import type { Dependency } from '~/domain/interfaces/project.interface';

import React from 'react';
import { Ban, Link2, CircleDashed } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { PROJECTS } from '~/usecase/mock/projects';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { DependencyType } from '~/domain/enums/provider.enum';

interface DependencyListProps {
  className?: string;
  dependencies: Array<Dependency>;
  installedIds?: Array<string>;
}

const TYPE_META = {
  [DependencyType.Required]: { icon: Link2, label: 'Required', className: 'bg-primary/10 text-primary' },
  [DependencyType.Optional]: { icon: CircleDashed, label: 'Optional', className: 'bg-muted text-muted-foreground' },
  [DependencyType.Incompatible]: { icon: Ban, label: 'Incompatible', className: 'bg-destructive/15 text-destructive' }
};

const DependencyList = ({ dependencies, installedIds = [], className }: DependencyListProps) => {
  if (dependencies.length === 0) return <p className={cn('text-sm text-muted-foreground', className)}>No dependencies.</p>;
  return (
    <ul className={cn('flex flex-col divide-y rounded-md border', className)}>
      {dependencies.map((dep) => {
        const meta = TYPE_META[dep.type];
        const project = PROJECTS.find((p) => p.id === dep.projectId);
        const installed = installedIds.includes(dep.projectId);
        return (
          <li key={dep.projectId} className="flex items-center gap-3 px-3 py-2 text-sm">
            <ProjectIcon size="sm" name={dep.name} color={project?.iconColor ?? '#666'} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{dep.name}</span>
              <span className="text-xs text-muted-foreground">{dep.versionRange === '*' ? 'Any version' : dep.versionRange}</span>
            </span>
            {installed && dep.type !== DependencyType.Incompatible && (
              <Badge variant="outline" className="text-muted-foreground">
                Installed
              </Badge>
            )}
            <Badge className={cn('gap-1', meta.className)}>
              <meta.icon />
              {meta.label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
};

export default DependencyList;
