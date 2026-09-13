import type { ProjectDetailsPanelProps } from './types';
import type { Project, ProjectVersion } from '~/domain/interfaces/project.interface';

import React from 'react';
import { Link } from 'react-router-dom';

import { X, Check, Clock, Heart, Loader2, Download, ExternalLink } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import ProjectIcon from '~/components/commons/ProjectIcon';
import RichContent from '~/components/commons/RichContent';
import { projectService } from '~/usecase/service/project';
import { ProviderBadge } from '~/components/commons/Badges';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '~/components/ui/tabs';
import { formatDate, formatCompact, formatRelative } from '~/usecase/util/formatUtils';

const ProjectDetailsPanel = ({ project, onClose, instance, installed, onInstall, installing }: ProjectDetailsPanelProps) => {
  const panelRef = React.useRef<HTMLElement>(null);
  const resizing = React.useRef(false);
  const [width, setWidth] = React.useState(448);
  const [visible, setVisible] = React.useState(false);
  const [tab, setTab] = React.useState('description');
  const [detailsLoading, setDetailsLoading] = React.useState(true);
  const [details, setDetails] = React.useState<Project>(project);
  const [versions, setVersions] = React.useState<Array<ProjectVersion>>();

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setTab('description');
    setDetails(project);
    setVersions(undefined);
    setDetailsLoading(true);
    void projectService
      .getProject(project.id)
      .then((nextDetails) => {
        if (!cancelled) setDetails(nextDetails);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  React.useEffect(() => {
    if (tab !== 'changelog' || versions !== undefined) return;
    let cancelled = false;
    void projectService
      .getVersions(project.id)
      .then((nextVersions) => {
        if (!cancelled) setVersions(nextVersions);
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, tab, versions]);

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

  const changelogs = versions?.filter((version) => version.changelog.trim()) ?? [];
  const categories = details.categories.slice(0, 8);
  const supportedVersions = details.gameVersions.slice(0, 6);
  const latestVersion = versions?.[0]?.number || details.latestVersion || 'Unknown';

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed top-8 right-0 bottom-0 left-0 z-20 bg-black/10 transition-opacity duration-200 motion-reduce:duration-0 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        ref={panelRef}
        style={{ width }}
        aria-label={`${details.name} details`}
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

        <div className="flex items-center gap-2 border-b border-border/50 bg-secondary/80 p-2">
          <ProjectIcon size="md" name={details.name} color={details.iconColor} imageUrl={details.iconUrl} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold tracking-tight">{details.name}</h2>
            <p className="truncate text-xs text-muted-foreground">by {details.author}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={close} aria-label="Close details">
            <X />
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-b border-border/50 p-3">
          <div className="flex flex-wrap gap-1">
            <ProviderBadge providerId={details.provider.id} />
            <Badge variant="secondary" className="capitalize">
              {details.type}
            </Badge>
            {categories.map((category) => (
              <Badge key={category} variant="outline" className="text-muted-foreground">
                {category}
              </Badge>
            ))}
            {details.categories.length > categories.length ? (
              <Badge variant="outline" className="text-muted-foreground">
                +{details.categories.length - categories.length}
              </Badge>
            ) : null}
          </div>

          <dl className="grid grid-cols-4 gap-2 text-xs">
            <div className="min-w-0">
              <dt className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Download className="size-3" />
                Downloads
              </dt>
              <dd className="truncate font-medium tabular-nums">{formatCompact(details.downloads)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Heart className="size-3" />
                Followers
              </dt>
              <dd className="truncate font-medium tabular-nums">{formatCompact(details.followers)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="size-3" />
                Updated
              </dt>
              <dd className="truncate font-medium">{formatRelative(details.updatedAt)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] text-muted-foreground">Latest version</dt>
              <dd className="truncate font-mono font-medium">{latestVersion}</dd>
            </div>
          </dl>

          {(supportedVersions.length > 0 || details.loaders.length > 0) && (
            <div className="flex items-start gap-2 text-xs">
              <span className="shrink-0 font-medium">Supports</span>
              <div className="flex min-w-0 flex-wrap gap-1 text-muted-foreground">
                {supportedVersions.map((version) => (
                  <Badge key={version} variant="outline" className="font-mono text-muted-foreground">
                    {version}
                  </Badge>
                ))}
                {details.gameVersions.length > supportedVersions.length ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    +{details.gameVersions.length - supportedVersions.length}
                  </Badge>
                ) : null}
                {details.loaders.map((loader) => (
                  <Badge key={loader} variant="secondary" className="capitalize">
                    {loader}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="mx-3 mt-1">
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="changelog">Changelog</TabsTrigger>
          </TabsList>
          <TabsContent value="description" aria-busy={detailsLoading} className="min-h-0 overflow-y-auto p-3 pt-2">
            {detailsLoading ? (
              <div role="status" className="flex flex-col gap-3" aria-label="Loading description">
                <Skeleton className="h-6 w-3/5" />
                <Skeleton className="aspect-video w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : (
              <RichContent emptyMessage="No description available." content={details.description || details.summary} />
            )}
          </TabsContent>
          <TabsContent value="changelog" className="min-h-0 overflow-y-auto p-3 pt-2">
            {versions === undefined ? (
              <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading changelog...
              </div>
            ) : changelogs.length > 0 ? (
              <div className="flex flex-col gap-4">
                {changelogs.map((version) => (
                  <section key={version.id} className="flex flex-col gap-1">
                    <h3 className="flex items-baseline gap-2 font-mono text-xs font-semibold">
                      {version.number}
                      <span className="font-sans text-[10px] font-normal text-muted-foreground">
                        {formatDate(version.publishedAt)}
                      </span>
                    </h3>
                    <RichContent content={version.changelog} />
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No changelog available.</p>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 border-t border-border/50 p-2">
          <Button
            onClick={onInstall}
            className="min-w-0 flex-1"
            disabled={installed || installing}
            variant={installed ? 'secondary' : 'default'}
          >
            {installing ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : installed ? (
              <Check data-icon="inline-start" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            <span className="truncate">
              {installing
                ? `Installing to ${instance?.name}`
                : installed
                  ? `Installed in ${instance?.name}`
                  : instance
                    ? `Install to ${instance.name}`
                    : 'Install'}
            </span>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/project/${encodeURIComponent(details.id)}${instance ? `?instance=${instance.id}` : ''}`}>
              Full details
            </Link>
          </Button>
          <Button asChild variant="outline" size={instance ? 'icon' : 'default'}>
            <a
              target="_blank"
              rel="noreferrer"
              href={details.provider.url}
              aria-label={instance ? `Open ${details.name} on its provider` : undefined}
            >
              <ExternalLink data-icon={instance ? undefined : 'inline-start'} />
              {instance ? <span className="sr-only">Provider</span> : 'Provider'}
            </a>
          </Button>
        </div>
      </aside>
    </>
  );
};

export default ProjectDetailsPanel;
