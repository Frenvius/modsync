import type { InstalledMod } from '~/domain/interfaces/instance.interface';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ArrowUp, History, ExternalLink, MoreHorizontal } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { Checkbox } from '~/components/ui/checkbox';
import { UpdateStatus } from '~/domain/enums/provider.enum';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { ProviderBadge, UpdateBadge } from '~/components/commons/Badges';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '~/components/ui/dropdown-menu';

export interface ModRowHandlers {
  onUpdate: (projectId: string) => void;
  onRemove: (projectId: string) => void;
  onToggle: (projectId: string, enabled: boolean) => void;
  onChangeVersion: (projectId: string) => void;
}

interface ModListItemProps {
  mod: InstalledMod;
  selected: boolean;
  handlers: ModRowHandlers;
  onSelect: (projectId: string, selected: boolean) => void;
}

const ModListItem = ({ mod, selected, handlers, onSelect }: ModListItemProps) => {
  const navigate = useNavigate();
  const updatable = mod.status === UpdateStatus.UpdateAvailable;

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_auto_minmax(0,2fr)_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 border-b px-3 py-2 text-sm transition-colors last:border-b-0 hover:bg-accent/40',
        selected && 'bg-primary/5',
        !mod.enabled && 'opacity-60'
      )}
    >
      <Checkbox checked={selected} aria-label={`Select ${mod.name}`} onCheckedChange={(v) => onSelect(mod.projectId, v === true)} />
      <ProjectIcon size="md" name={mod.name} color={mod.iconColor} />
      <div className="flex min-w-0 flex-col">
        <button type="button" className="truncate text-left font-medium hover:underline" onClick={() => navigate(`/project/${mod.projectId}`)}>
          {mod.name}
        </button>
        <span className="truncate text-xs text-muted-foreground">
          by {mod.author}
          {mod.missingDependency && <span className="text-warning"> · needs {mod.missingDependency}</span>}
        </span>
      </div>
      <div className="flex flex-col font-mono text-xs tabular-nums">
        <span>{mod.installedVersion}</span>
        {updatable && <span className="text-info">{mod.latestCompatibleVersion} available</span>}
      </div>
      <ProviderBadge providerId={mod.provider} />
      <span className="flex w-40 justify-start">
        <UpdateBadge status={mod.status} />
      </span>
      <Switch
        size="sm"
        checked={mod.enabled}
        aria-label={mod.enabled ? 'Disable' : 'Enable'}
        onCheckedChange={(v) => handlers.onToggle(mod.projectId, v)}
      />
      <span className="flex items-center gap-1">
        {updatable && (
          <Button size="xs" variant="secondary" onClick={() => handlers.onUpdate(mod.projectId)}>
            <ArrowUp data-icon="inline-start" />
            Update
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label="Mod actions">
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
      </span>
    </div>
  );
};

export default ModListItem;
