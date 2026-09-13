import type { ProjectDetailsPanelProps } from './types';

import React from 'react';
import { Link } from 'react-router-dom';

import { X, Clock, Heart, Download, ExternalLink } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { ProviderBadge } from '~/components/commons/Badges';
import { formatCompact, formatRelative } from '~/usecase/util/formatUtils';

const ProjectDetailsPanel = ({ project, onClose, instanceId }: ProjectDetailsPanelProps) => {
  const panelRef = React.useRef<HTMLElement>(null);
  const resizing = React.useRef(false);
  const [width, setWidth] = React.useState(448);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const close = React.useCallback(() => {
    if (!visible) return;
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose, visible]);

  React.useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || panelRef.current?.contains(target) || target.closest('[data-project-row]')) return;
      close();
    };

    document.addEventListener('pointerdown', closeFromOutside);
    return () => document.removeEventListener('pointerdown', closeFromOutside);
  }, [close]);

  const resize = (nextWidth: number) => {
    const value = Math.round(Math.min(Math.max(nextWidth, 320), Math.max(320, window.innerWidth * 0.7)));
    setWidth(value);
  };

  const handleResizeKey = (event: React.KeyboardEvent) => {
    if (!['End', 'Home', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') return resize(320);
    if (event.key === 'End') return resize(window.innerWidth * 0.7);
    resize(width + (event.key === 'ArrowLeft' ? 24 : -24));
  };

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed top-8 right-0 bottom-0 left-0 z-20 bg-black/10 transition-opacity duration-200 motion-reduce:duration-0 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        ref={panelRef}
        style={{ width }}
        aria-label={`${project.name} details`}
        onClick={(event) => event.stopPropagation()}
        className={`fixed top-[38px] right-1.5 bottom-1.5 z-30 flex max-w-full flex-col overflow-hidden rounded-lg border bg-card shadow-[-8px_0_24px_-16px_oklch(0_0_0/70%)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:duration-0 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div
          tabIndex={0}
          role="separator"
          aria-valuemin={320}
          aria-valuenow={width}
          aria-orientation="vertical"
          onKeyDown={handleResizeKey}
          aria-label="Resize details panel"
          aria-valuemax={Math.round(Math.max(320, window.innerWidth * 0.7))}
          onPointerMove={(event) => resizing.current && resize(window.innerWidth - event.clientX)}
          onPointerUp={(event) => {
            resizing.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          }}
          onPointerDown={(event) => {
            resizing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-primary"
        />
        <div className="flex items-start gap-3 border-b border-border/50 bg-secondary/80 p-3">
          <ProjectIcon size="lg" name={project.name} color={project.iconColor} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold tracking-tight">{project.name}</h2>
            <p className="truncate text-sm text-muted-foreground">by {project.author}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={close} aria-label="Close details">
            <X />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-1.5">
            <ProviderBadge providerId={project.provider.id} />
            <Badge variant="secondary" className="capitalize">
              {project.type}
            </Badge>
            {project.categories.map((category) => (
              <Badge key={category} variant="outline" className="text-muted-foreground">
                {category}
              </Badge>
            ))}
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">{project.summary}</p>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Download className="size-3.5" />
                Downloads
              </dt>
              <dd className="mt-1 font-medium tabular-nums">{formatCompact(project.downloads)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Heart className="size-3.5" />
                Followers
              </dt>
              <dd className="mt-1 font-medium tabular-nums">{formatCompact(project.followers)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                Updated
              </dt>
              <dd className="mt-1 font-medium">{formatRelative(project.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latest version</dt>
              <dd className="mt-1 font-mono font-medium">{project.latestVersion || 'Unknown'}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Supports</h3>
            <div className="flex flex-wrap gap-1">
              {project.gameVersions.map((version) => (
                <Badge key={version} variant="outline" className="font-mono text-muted-foreground">
                  {version}
                </Badge>
              ))}
            </div>
            {project.loaders.length > 0 && <p className="text-xs text-muted-foreground">{project.loaders.join(', ')}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">About</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{project.description}</p>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border/50 p-3">
          <Button asChild className="flex-1">
            <Link to={`/project/${encodeURIComponent(project.id)}${instanceId ? `?instance=${instanceId}` : ''}`}>
              Full details
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a target="_blank" rel="noreferrer" href={project.provider.url}>
              <ExternalLink data-icon="inline-start" />
              Provider
            </a>
          </Button>
        </div>
      </aside>
    </>
  );
};

export default ProjectDetailsPanel;
