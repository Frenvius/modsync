import type { DependencyListProps } from './types';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { DependencyType } from '~/domain/enums/provider.enum';

import { DEPENDENCY_TYPE_META } from './constants';

const DependencyList = ({ className, dependencies, installedIds = [] }: DependencyListProps) => {
  if (dependencies.length === 0) return <p className={cn('text-sm text-muted-foreground', className)}>No dependencies.</p>;
  return (
    <ul className={cn('flex flex-col divide-y rounded-md border', className)}>
      {dependencies.map((dep) => {
        const meta = DEPENDENCY_TYPE_META[dep.type];
        const installed = installedIds.includes(dep.projectId);
        return (
          <li key={dep.projectId} className="flex items-center gap-3 px-3 py-2 text-sm">
            <ProjectIcon size="sm" color="#666" name={dep.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{dep.name}</span>
              <span className="text-xs text-muted-foreground">
                {!dep.versionRange || dep.versionRange === '*' ? 'Any version' : dep.versionRange}
              </span>
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
