import type { ModpackCardProps } from './types';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Share2, Package } from 'lucide-react';

import { Button } from '~/components/ui/button';
import GameIcon from '~/components/commons/GameIcon';
import { VersionBadge } from '~/components/commons/Badges';
import { projectService } from '~/usecase/service/project';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { formatRelative } from '~/usecase/util/formatUtils';

const ModpackCard = ({ modpack, onShare }: ModpackCardProps) => {
  const navigate = useNavigate();
  const game = projectService.getGame(modpack.gameId);
  const open = () => navigate(`/modpack/${modpack.id}`);

  const share = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare(modpack);
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card transition-all hover:-translate-y-px hover:border-border hover:shadow-[0_8px_24px_-12px_oklch(0_0_0/70%)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div
        className="relative h-24"
        style={{
          background: `linear-gradient(120deg, ${modpack.coverColor} 0%, color-mix(in oklch, ${modpack.coverColor} 40%, black) 100%)`
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,oklch(1_0_0/18%),transparent_50%)]" />
        <div className="absolute bottom-2 left-3 flex -space-x-1.5">
          {modpack.mods.slice(0, 5).map((m) => (
            <ProjectIcon size="sm" name={m.name} key={m.projectId} color={m.iconColor} className="ring-2 ring-black/40" />
          ))}
        </div>
        <GameIcon size="sm" gameId={modpack.gameId} className="absolute top-2 right-2" />
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium leading-tight">{modpack.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              by {modpack.author} · {game.name}
            </span>
          </div>
          <Button size="icon-xs" variant="ghost" onClick={share} aria-label="Share">
            <Share2 />
          </Button>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{modpack.description}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <VersionBadge loader={modpack.loader} version={modpack.gameVersion} />
          <span className="flex items-center gap-1">
            <Package className="size-3" />
            {modpack.mods.length}
          </span>
          <span className="flex-1" />
          <span>v{modpack.version}</span>
          <span>{formatRelative(modpack.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
};

export default ModpackCard;
