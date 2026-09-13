import type { MarkdownProps } from './types';
import type { Project, ProjectVersion } from '~/domain/interfaces/project.interface';

import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import { Heart, Clock, Loader2, Package, Download, ExternalLink, AlertTriangle } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { LOADER_NAMES } from '~/usecase/mock/games';
import GameIcon from '~/components/commons/GameIcon';
import { useAppStore } from '~/usecase/store/appStore';
import EmptyState from '~/components/commons/EmptyState';
import { projectService } from '~/usecase/service/project';
import ProjectIcon from '~/components/commons/ProjectIcon';
import InstallDialog from '~/components/Mods/InstallDialog';
import InstanceIcon from '~/components/commons/InstanceIcon';
import { getProviderMeta } from '~/usecase/service/providers';
import DependencyList from '~/components/Mods/DependencyList';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '~/components/ui/tabs';
import { ProviderBadge, CompatibilityBadge } from '~/components/commons/Badges';
import { formatDate, formatBytes, formatCompact, formatRelative } from '~/usecase/util/formatUtils';
import { Table, TableRow, TableBody, TableCell, TableHead, TableHeader } from '~/components/ui/table';

const ProjectPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const instances = useAppStore((s) => s.instances);
  const [installOpen, setInstallOpen] = React.useState(false);
  const [installVersion, setInstallVersion] = React.useState<string>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>();
  const [project, setProject] = React.useState<Project | undefined>();
  const [versions, setVersions] = React.useState<Array<ProjectVersion>>([]);

  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    setLoading(true);
    void Promise.all([projectService.getProject(projectId ?? ''), projectService.getVersions(projectId ?? '')])
      .then(([nextProject, nextVersions]) => {
        if (cancelled) return;
        setProject(nextProject);
        setVersions(nextVersions);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getErrorMessage(loadError, 'The provider could not load this project.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <EmptyState
          description={error}
          icon={error ? AlertTriangle : Package}
          title={error ? 'Provider unavailable' : 'Project not found'}
        >
          <Button variant="outline" onClick={() => navigate('/discover')}>
            Back to Discover
          </Button>
        </EmptyState>
      </div>
    );
  }

  const provider = getProviderMeta(project.provider.id);
  const game = projectService.getGame(project.gameId);
  const latest = versions[0];
  const sameGame = instances.filter((i) => i.gameId === project.gameId);

  return (
    <div className="flex flex-col">
      <div
        className="h-32 shrink-0"
        style={{
          background: `linear-gradient(120deg, color-mix(in oklch, ${project.iconColor} 30%, var(--background)) 0%, var(--background) 80%)`
        }}
      />
      <div className="-mt-12 flex flex-col gap-6 px-6 pb-6">
        <div className="flex items-end gap-5">
          <ProjectIcon size="xl" name={project.name} color={project.iconColor} className="border-4 border-background shadow-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pb-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{project.summary}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">by {project.author}</span>
              <ProviderBadge providerId={project.provider.id} />
              <Badge variant="outline" className="gap-1.5">
                <GameIcon size="sm" gameId={project.gameId} className="size-3.5 rounded-[3px] [&>svg]:size-2.5" />
                {game.name}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {project.type}
              </Badge>
              {project.categories.map((c) => (
                <Badge key={c} variant="outline" className="text-muted-foreground">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Button
              onClick={() => {
                setInstallVersion(undefined);
                setInstallOpen(true);
              }}
            >
              <Download data-icon="inline-start" />
              Install
            </Button>
            <Button asChild variant="outline">
              <a target="_blank" rel="noreferrer" href={project.provider.url}>
                <ExternalLink data-icon="inline-start" />
                {provider.name}
              </a>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Download className="size-4" />
            <strong className="font-medium text-foreground">{formatCompact(project.downloads)}</strong> downloads
          </span>
          <span className="flex items-center gap-1.5">
            <Heart className="size-4" />
            <strong className="font-medium text-foreground">{formatCompact(project.followers)}</strong> followers
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-4" />
            updated <strong className="font-medium text-foreground">{formatRelative(project.updatedAt)}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Package className="size-4" />
            latest{' '}
            <strong className="font-mono font-medium text-foreground">
              {latest?.number || project.latestVersion || 'Unknown'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Tabs defaultValue="description">
            <TabsList variant="line">
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="gallery">Gallery</TabsTrigger>
              <TabsTrigger value="versions">Versions</TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
              <TabsTrigger value="changelog">Changelog</TabsTrigger>
              <TabsTrigger value="compatibility">Compatibility</TabsTrigger>
            </TabsList>

            <TabsContent className="pt-2" value="description">
              <Markdown source={project.description} />
            </TabsContent>

            <TabsContent value="gallery" className="grid grid-cols-3 gap-3 pt-2">
              {project.gallery.map((image, index) => (
                <img
                  src={image}
                  key={image}
                  loading="lazy"
                  alt={`${project.name} screenshot ${index + 1}`}
                  className="aspect-video rounded-lg border object-cover"
                />
              ))}
            </TabsContent>

            <TabsContent value="versions" className="pt-2">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Game versions</TableHead>
                      <TableHead>Loaders</TableHead>
                      <TableHead className="text-right">Downloads</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>
                        <span className="sr-only">Install</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((v, i) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono font-medium">
                          {v.number}
                          {i === 0 && <Badge className="ml-2 bg-primary/10 text-primary">Latest</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {v.gameVersions.slice(0, 3).join(', ')}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {v.loaders.map((l) => LOADER_NAMES[l]).join(', ') || 'Any'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCompact(v.downloads)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBytes(v.fileSize)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(v.publishedAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              setInstallVersion(v.number);
                              setInstallOpen(true);
                            }}
                          >
                            Install
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent className="pt-2" value="dependencies">
              <DependencyList dependencies={latest?.dependencies ?? []} />
            </TabsContent>

            <TabsContent value="changelog" className="flex flex-col gap-5 pt-2">
              {versions.map((v) => (
                <article key={v.id} className="flex flex-col gap-1">
                  <h3 className="flex items-center gap-2 font-mono text-sm font-semibold">
                    {v.number}
                    <span className="font-sans text-xs font-normal text-muted-foreground">{formatDate(v.publishedAt)}</span>
                  </h3>
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{v.changelog}</p>
                </article>
              ))}
            </TabsContent>

            <TabsContent value="compatibility" className="flex flex-col gap-2 pt-2">
              {sameGame.length === 0 && <p className="text-sm text-muted-foreground">You have no {game.name} instances yet.</p>}
              {sameGame.map((instance) => {
                const report = projectService.checkCompatibility(project, instance);
                return (
                  <div key={instance.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-3">
                      <InstanceIcon size="sm" icon={instance.icon} color={instance.iconColor} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{instance.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {instance.gameVersion} · {LOADER_NAMES[instance.loader]}
                        </span>
                      </span>
                      <CompatibilityBadge issues={report.issues} />
                      <Button
                        size="xs"
                        variant="secondary"
                        disabled={!report.compatible}
                        onClick={() => navigate(`/discover?instance=${instance.id}`)}
                      >
                        Browse for it
                      </Button>
                    </div>
                    {report.issues.map((issue) => (
                      <p key={issue.message} className="text-xs text-muted-foreground">
                        {issue.message} {issue.remediation && <span className="text-foreground/80">{issue.remediation}.</span>}
                      </p>
                    ))}
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>

          <aside className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Provider</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="size-2.5 rounded-full" style={{ background: provider.color }} />
                {provider.name}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>External ID</dt>
                <dd className="truncate font-mono text-foreground">{project.provider.externalId}</dd>
                <dt>Slug</dt>
                <dd className="truncate font-mono text-foreground">{project.slug}</dd>
              </dl>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Supports</h3>
              <div className="flex flex-wrap gap-1">
                {project.gameVersions.map((v) => (
                  <Badge key={v} variant="outline" className="font-mono text-muted-foreground">
                    {v}
                  </Badge>
                ))}
              </div>
              {project.loaders.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {project.loaders.map((l) => (
                    <Badge key={l} variant="secondary">
                      {LOADER_NAMES[l]}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      <InstallDialog
        project={project}
        open={installOpen}
        version={installVersion}
        onOpenChange={setInstallOpen}
        instanceId={searchParams.get('instance') ?? undefined}
      />
    </div>
  );
};

const Markdown = ({ source }: MarkdownProps) => (
  <div className="flex max-w-3xl flex-col gap-3 text-sm leading-relaxed">
    {source.split('\n\n').map((block, i) => {
      if (block.startsWith('## ')) {
        return (
          <h2 key={i} className="pt-2 text-base font-semibold">
            {block.slice(3)}
          </h2>
        );
      }
      if (block.startsWith('- ')) {
        return (
          <ul key={i} className="list-disc flex flex-col gap-1 pl-5 text-muted-foreground">
            {block.split('\n').map((line) => (
              <li key={line}>{line.slice(2)}</li>
            ))}
          </ul>
        );
      }
      return (
        <p key={i} className="text-muted-foreground">
          {block}
        </p>
      );
    })}
  </div>
);

export default ProjectPage;
