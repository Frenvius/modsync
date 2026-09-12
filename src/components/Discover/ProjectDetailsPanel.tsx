import type { Project } from '~/domain/interfaces/project.interface';

import React from 'react';
import { Clock, Download, ExternalLink, Heart, X } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { ProviderBadge } from '~/components/commons/Badges';
import { formatCompact, formatRelative } from '~/usecase/util/formatUtils';

interface ProjectDetailsPanelProps {
  project: Project;
  installed?: boolean;
  onClose: () => void;
  onInstall: (project: Project) => void;
}

const ProjectDetailsPanel = ({ project, installed, onClose, onInstall }: ProjectDetailsPanelProps) => {
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
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') return resize(320);
    if (event.key === 'End') return resize(window.innerWidth * 0.7);
    resize(width + (event.key === 'ArrowLeft' ? 24 : -24));
  };

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed top-12 right-0 bottom-0 left-0 z-20 bg-black/10 transition-opacity duration-200 motion-reduce:duration-0 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        ref={panelRef}
        aria-label={`${project.name} details`}
        className={`fixed top-12 right-0 bottom-0 z-30 flex max-w-full flex-col border-l bg-background shadow-[-8px_0_24px_-16px_oklch(0_0_0/70%)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:duration-0 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize details panel"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={Math.round(Math.max(320, window.innerWidth * 0.7))}
          aria-valuenow={width}
          className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-primary"
          onKeyDown={handleResizeKey}
          onPointerDown={(event) => {
            resizing.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          onPointerMove={(event) => resizing.current && resize(window.innerWidth - event.clientX)}
          onPointerUp={(event) => {
            resizing.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          }}
        />
    <div className="flex items-start gap-3 border-b p-4">
      <ProjectIcon size="lg" name={project.name} color={project.iconColor} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold tracking-tight">{project.name}</h2>
        <p className="truncate text-sm text-muted-foreground">by {project.author}</p>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label="Close details" onClick={close}>
        <X />
      </Button>
    </div>

    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <div className="flex flex-wrap gap-1.5">
        <ProviderBadge providerId={project.provider.id} />
        <Badge variant="secondary" className="capitalize">{project.type}</Badge>
        {project.categories.map((category) => (
          <Badge key={category} variant="outline" className="text-muted-foreground">{category}</Badge>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{project.summary}</p>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Download className="size-3.5" />Downloads</dt>
          <dd className="mt-1 font-medium tabular-nums">{formatCompact(project.downloads)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Heart className="size-3.5" />Followers</dt>
          <dd className="mt-1 font-medium tabular-nums">{formatCompact(project.followers)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" />Updated</dt>
          <dd className="mt-1 font-medium">{formatRelative(project.updatedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Latest version</dt>
          <dd className="mt-1 font-mono font-medium">{project.latestVersion}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Supports</h3>
        <div className="flex flex-wrap gap-1">
          {project.gameVersions.map((version) => (
            <Badge key={version} variant="outline" className="font-mono text-muted-foreground">{version}</Badge>
          ))}
        </div>
        {project.loaders.length > 0 && <p className="text-xs text-muted-foreground">{project.loaders.join(', ')}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">About</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{project.description}</p>
      </div>
    </div>

    <div className="flex gap-2 border-t p-4">
      <Button variant="outline" asChild>
        <a href={project.provider.url} target="_blank" rel="noreferrer">
          <ExternalLink data-icon="inline-start" />
          Provider
        </a>
      </Button>
      <Button className="flex-1" disabled={installed} onClick={() => onInstall(project)}>
        <Download data-icon="inline-start" />
        {installed ? 'Installed' : 'Install'}
      </Button>
    </div>
    </aside>
  </>
  );
};

export default ProjectDetailsPanel;
