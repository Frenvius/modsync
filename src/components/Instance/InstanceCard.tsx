import type { InstanceCardProps } from './types';

import { useNavigate } from 'react-router-dom';

import { Play, Clock, Loader2, Package } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { usePlay } from '~/usecase/hooks/usePlay';
import GameIcon from '~/components/commons/GameIcon';
import { projectService } from '~/usecase/service/project';
import { UpdateStatus } from '~/domain/enums/provider.enum';
import { formatRelative } from '~/usecase/util/formatUtils';
import InstanceIcon from '~/components/commons/InstanceIcon';
import { summarizeStatus } from '~/usecase/util/instanceUtils';
import { UpdateBadge, VersionBadge } from '~/components/commons/Badges';

import InstanceMenu from './InstanceMenu';

const InstanceCard = ({ instance, className }: InstanceCardProps) => {
  const navigate = useNavigate();
  const { play, playing } = usePlay(instance.id);
  const game = projectService.getGame(instance.gameId);
  const status = summarizeStatus(instance);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/instance/${instance.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/instance/${instance.id}`)}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-lg border bg-card p-3 transition-all',
        'hover:-translate-y-px hover:border-border hover:bg-card/80 hover:shadow-[0_8px_24px_-12px_oklch(0_0_0/70%)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <InstanceIcon size="lg" icon={instance.icon} color={instance.iconColor} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium leading-tight">{instance.name}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GameIcon size="sm" gameId={instance.gameId} className="size-3.5 rounded-[3px] [&>svg]:size-2.5" />
            <span className="truncate">{game.name}</span>
          </span>
          <VersionBadge className="mt-1 w-fit" loader={instance.loader} version={instance.gameVersion} />
        </div>
        <InstanceMenu instance={instance} />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Package className="size-3.5" />
          {instance.mods.length} mods
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          {formatRelative(instance.lastPlayed)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        {status === UpdateStatus.UpToDate ? (
          <span className="text-xs text-muted-foreground">All up to date</span>
        ) : (
          <UpdateBadge status={status} />
        )}
        <Button size="sm" onClick={play} disabled={playing} className="shadow-[0_0_0_1px_oklch(0_0_0/20%)]">
          {playing ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Play data-icon="inline-start" className="fill-current" />
          )}
          Play
        </Button>
      </div>
    </div>
  );
};

export default InstanceCard;
