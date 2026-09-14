import type { InstanceListItemProps } from './types';

import { useNavigate } from 'react-router-dom';

import { Play, Loader2 } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { usePlay } from '~/usecase/hooks/usePlay';
import GameIcon from '~/components/commons/GameIcon';
import { projectService } from '~/usecase/service/project';
import InstanceIcon from '~/components/commons/InstanceIcon';
import { summarizeStatus } from '~/usecase/util/instanceUtils';
import { UpdateBadge, VersionBadge } from '~/components/commons/Badges';
import { formatRelative, formatPlaytime } from '~/usecase/util/formatUtils';

import InstanceMenu from './InstanceMenu';

const InstanceListItem = ({ instance }: InstanceListItemProps) => {
  const navigate = useNavigate();
  const { play, playing } = usePlay(instance.id);
  const game = projectService.getGame(instance.gameId);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/instance/${instance.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/instance/${instance.id}`)}
      className="grid cursor-pointer grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_auto_auto_auto_auto_auto] items-center gap-4 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:border-border hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <InstanceIcon size="sm" icon={instance.icon} color={instance.iconColor} />
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{instance.name}</span>
        {instance.ownership === 'joined' && <Badge variant="outline">Joined</Badge>}
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <GameIcon size="sm" gameId={instance.gameId} />
        <span className="truncate">{game.name}</span>
      </span>
      <VersionBadge loader={instance.loader} version={instance.gameVersion} />
      <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{instance.mods.length} mods</span>
      <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
        {formatPlaytime(instance.playtimeMinutes)}
      </span>
      <span className="w-40 flex justify-end">
        <UpdateBadge status={summarizeStatus(instance)} />
      </span>
      <span className="flex items-center gap-1">
        <span className="w-16 text-right text-xs text-muted-foreground">{formatRelative(instance.lastPlayed)}</span>
        <Button size="icon-sm" onClick={play} variant="ghost" aria-label="Play" disabled={playing}>
          {playing ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />}
        </Button>
        <InstanceMenu instance={instance} />
      </span>
    </div>
  );
};

export default InstanceListItem;
