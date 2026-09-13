import type { ModListItemProps } from './types';

import { useNavigate } from 'react-router-dom';

import { Trash2, ArrowUp, History, ExternalLink, MoreHorizontal } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { Checkbox } from '~/components/ui/checkbox';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { TableRow, TableCell } from '~/components/ui/table';
import { UpdateStatus } from '~/domain/enums/provider.enum';
import { UpdateBadge, ProviderBadge } from '~/components/commons/Badges';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '~/components/ui/dropdown-menu';

const ModListItem = ({ mod, selected, handlers, onSelect }: ModListItemProps) => {
  const navigate = useNavigate();
  const updatable = mod.status === UpdateStatus.UpdateAvailable;

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      className={cn('h-14 hover:bg-accent/45 data-[state=selected]:bg-primary/10', !mod.enabled && 'text-muted-foreground')}
    >
      <TableCell className="pl-3">
        <Checkbox
          checked={selected}
          aria-label={`Select ${mod.name}`}
          onCheckedChange={(v) => onSelect(mod.projectId, v === true)}
        />
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectIcon size="md" name={mod.name} color={mod.iconColor} />
          <div className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => navigate(`/project/${mod.projectId}`)}
              className="truncate text-left font-medium text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {mod.name}
            </button>
            <span className="truncate text-xs text-muted-foreground">
              by {mod.author}
              {mod.missingDependency && <span className="text-warning"> · needs {mod.missingDependency}</span>}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col font-mono text-xs tabular-nums">
          <span className="text-foreground">{mod.installedVersion}</span>
          {updatable && <span className="text-info">{mod.latestCompatibleVersion}</span>}
        </div>
      </TableCell>
      <TableCell>
        <ProviderBadge providerId={mod.provider} />
      </TableCell>
      <TableCell>
        <UpdateBadge status={mod.status} />
      </TableCell>
      <TableCell className="text-center">
        <Switch
          size="sm"
          checked={mod.enabled}
          onCheckedChange={(v) => handlers.onToggle(mod.projectId, v)}
          aria-label={`${mod.enabled ? 'Disable' : 'Enable'} ${mod.name}`}
        />
      </TableCell>
      <TableCell className="pr-2">
        <div className="flex items-center justify-end gap-1">
          {updatable && (
            <Button size="xs" variant="secondary" onClick={() => handlers.onUpdate(mod.projectId)}>
              <ArrowUp data-icon="inline-start" />
              Update
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label={`Actions for ${mod.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate(`/project/${mod.projectId}`)}>
                  <ExternalLink />
                  Open details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlers.onChangeVersion(mod.projectId)}>
                  <History />
                  Change version
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={() => handlers.onRemove(mod.projectId)}>
                  <Trash2 />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default ModListItem;
