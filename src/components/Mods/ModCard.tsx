import type { ModCardProps } from './types';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Plus, Clock, Download } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { ProviderBadge } from '~/components/commons/Badges';
import { formatCompact, formatRelative } from '~/usecase/util/formatUtils';

const ModCard = ({ project, installed, onInstall }: ModCardProps) => {
  const navigate = useNavigate();
  const open = () => navigate(`/project/${project.id}`);

  const install = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInstall(project);
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open()}
      className="group flex cursor-pointer gap-3 rounded-lg border bg-card p-3 transition-all hover:border-border hover:bg-card/80 hover:shadow-[0_8px_24px_-12px_oklch(0_0_0/70%)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ProjectIcon size="lg" name={project.name} color={project.iconColor} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium leading-tight">{project.name}</span>
            <span className="truncate text-xs text-muted-foreground">by {project.author}</span>
          </div>
          <ProviderBadge compact providerId={project.provider.id} />
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{project.summary}</p>
        <div className="flex flex-wrap items-center gap-1">
          {project.categories.slice(0, 3).map((c) => (
            <Badge key={c} variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">
              {c}
            </Badge>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download className="size-3" />
            {formatCompact(project.downloads)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatRelative(project.updatedAt)}
          </span>
          <span className="truncate font-mono">{project.gameVersions.slice(0, 2).join(', ')}</span>
          <span className="flex-1" />
          <Button size="xs" onClick={install} disabled={installed} variant={installed ? 'secondary' : 'default'}>
            {!installed && <Plus data-icon="inline-start" />}
            {installed ? 'Installed' : 'Install'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ModCard;
