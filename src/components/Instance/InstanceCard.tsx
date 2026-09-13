import type { InstanceCardProps } from './types';

import { useNavigate } from 'react-router-dom';

import { Play, Clock, Loader2, Package } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { usePlay } from '~/usecase/hooks/usePlay';
import GameIcon from '~/components/commons/GameIcon';
import { projectService } from '~/usecase/service/project';
import { VersionBadge } from '~/components/commons/Badges';
import { UpdateStatus } from '~/domain/enums/provider.enum';
import { formatRelative } from '~/usecase/util/formatUtils';
import InstanceIcon from '~/components/commons/InstanceIcon';
import { summarizeStatus } from '~/usecase/util/instanceUtils';
import { UPDATE_BADGE_META } from '~/components/commons/Badges/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';

import InstanceMenu from './InstanceMenu';

const InstanceCard = ({ instance, className }: InstanceCardProps) => {
  const navigate = useNavigate();
  const { play, playing } = usePlay(instance.id);
  const game = projectService.getGame(instance.gameId);
  const status = summarizeStatus(instance);
  const statusMeta = UPDATE_BADGE_META[status];
  const affectedMods = instance.mods.filter((mod) => mod.status === status).length;
  const statusDetails =
    status === UpdateStatus.UpToDate
      ? 'All mods are up to date'
      : `${affectedMods} ${affectedMods === 1 ? 'mod' : 'mods'}: ${statusMeta.label.toLowerCase()}`;

  return (
    <article
      onClick={() => navigate(`/instance/${instance.id}`)}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${instance.iconColor} 18%, var(--card)) 0%, var(--card) 72%)`
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors',
        'hover:border-primary/60 focus-within:border-primary/60',
        className
      )}
    >
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        <InstanceIcon size="md" icon={instance.icon} color={instance.iconColor} className="size-12 [&>svg]:size-6" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/instance/${instance.id}`);
            }}
            className="truncate text-left text-sm font-semibold leading-tight hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {instance.name}
          </button>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GameIcon size="sm" gameId={instance.gameId} className="size-3.5 rounded-[3px] [&>svg]:size-2.5" />
            <span className="truncate">{game.name}</span>
          </span>
          <VersionBadge className="w-fit" loader={instance.loader} version={instance.gameVersion} />
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={statusMeta.label}
                onClick={(event) => event.stopPropagation()}
                className="flex size-6 items-center justify-center rounded-md"
              >
                <span
                  className={cn('flex size-5 items-center justify-center rounded border border-current/30', statusMeta.className)}
                >
                  <statusMeta.icon className="size-3" />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{statusDetails}</TooltipContent>
          </Tooltip>
          <InstanceMenu instance={instance} />
        </div>
      </div>

      <div className="flex items-center gap-2 px-2 pb-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5 text-info" />
            {formatRelative(instance.lastPlayed)}
          </span>
          <span className="flex items-center gap-1">
            <Package className="size-3.5 text-primary" />
            <span>
              <strong className="font-semibold text-foreground">{instance.mods.length}</strong> mods
            </span>
          </span>
        </div>
        <Button size="sm" onClick={play} disabled={playing} className="ml-auto min-w-16">
          {playing ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Play data-icon="inline-start" className="fill-current" />
          )}
          Play
        </Button>
      </div>
    </article>
  );
};

export default InstanceCard;
