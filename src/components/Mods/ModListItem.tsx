import type { InstalledMod } from '~/domain/interfaces/instance.interface';

import { useNavigate } from 'react-router-dom';

import { Trash2, ArrowUp, GitBranch, RotateCcw, ExternalLink, MoreHorizontal } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { formatDate } from '~/usecase/util/formatUtils';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { TableRow, TableCell } from '~/components/ui/table';
import { ProviderId, UpdateStatus } from '~/domain/enums/provider.enum';
import { UpdateBadge, ProviderBadge } from '~/components/commons/Badges';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '~/components/ui/dropdown-menu';

interface ModListItemProps {
  mod: InstalledMod;
  onRemove: (projectId: string) => void;
  onRepair: (projectId: string) => void;
  onUpdate: (projectId: string) => void;
  onChangeVersion: (projectId: string) => void;
  onToggle: (projectId: string, enabled: boolean) => void;
}

const ModListItem = ({ mod, onRemove, onRepair, onUpdate, onToggle, onChangeVersion }: ModListItemProps) => {
  const navigate = useNavigate();

  return (
    <TableRow className="h-14 hover:bg-accent/45">
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectIcon size="md" name={mod.name} color={mod.iconColor} imageUrl={mod.iconUrl} />
          <div className="flex min-w-0 flex-col">
            {mod.provider === ProviderId.Local ? (
              <span className="truncate font-medium text-foreground">{mod.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/project/${encodeURIComponent(mod.projectId)}`)}
                className="truncate text-left font-medium text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {mod.name}
              </button>
            )}
            <span className="truncate text-xs text-muted-foreground">by {mod.author}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs tabular-nums">{mod.installedVersion}</TableCell>
      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
        {mod.installedVersionPublishedAt ? (
          <time dateTime={mod.installedVersionPublishedAt}>{formatDate(mod.installedVersionPublishedAt)}</time>
        ) : (
          <span aria-label="Release date unavailable">-</span>
        )}
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
          onCheckedChange={(enabled) => onToggle(mod.projectId, enabled)}
          aria-label={`${mod.enabled ? 'Disable' : 'Enable'} ${mod.name}`}
        />
      </TableCell>
      <TableCell className="text-right">
        {mod.updateAvailable && mod.provider !== ProviderId.Local && (
          <Button size="icon-xs" variant="ghost" aria-label={`Update ${mod.name}`} onClick={() => onUpdate(mod.projectId)}>
            <ArrowUp />
          </Button>
        )}
        {mod.status === UpdateStatus.Damaged && mod.provider !== ProviderId.Local && (
          <Button size="icon-xs" variant="ghost" aria-label={`Repair ${mod.name}`} onClick={() => onRepair(mod.projectId)}>
            <RotateCcw />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-xs" variant="ghost" aria-label={`${mod.name} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {mod.provider !== ProviderId.Local && (
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate(`/project/${encodeURIComponent(mod.projectId)}`)}>
                  <ExternalLink />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onChangeVersion(mod.projectId)}>
                  <GitBranch />
                  Change version
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}
            {mod.provider !== ProviderId.Local && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onClick={() => onRemove(mod.projectId)}>
              <Trash2 />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

export default ModListItem;
