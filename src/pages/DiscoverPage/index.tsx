import type { DiscoverFilters } from '~/components/Discover/types';
import type { Project, SearchSort } from '~/domain/interfaces/project.interface';

import React from 'react';
import { useSearchParams } from 'react-router-dom';

import { Plus, Clock, Compass, Download } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { useAppStore } from '~/usecase/store/appStore';
import SearchBar from '~/components/commons/SearchBar';
import EmptyState from '~/components/commons/EmptyState';
import PageHeader from '~/components/commons/PageHeader';
import { projectService } from '~/usecase/service/project';
import ProjectIcon from '~/components/commons/ProjectIcon';
import InstallDialog from '~/components/Mods/InstallDialog';
import { ProviderBadge } from '~/components/commons/Badges';
import { getProviderMeta } from '~/usecase/service/providers';
import FilterPopover from '~/components/Discover/FilterPopover';
import { formatCompact, formatRelative } from '~/usecase/util/formatUtils';
import ProjectDetailsPanel from '~/components/Discover/ProjectDetailsPanel';
import { Table, TableRow, TableBody, TableCell, TableHead, TableHeader } from '~/components/ui/table';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

import { DISCOVER_SORTS } from './constants';

const DiscoverPage = () => {
  const [params] = useSearchParams();
  const instances = useAppStore((s) => s.instances);
  const gameId = useAppStore((s) => s.selectedGameId);
  const setSelectedGame = useAppStore((s) => s.setSelectedGame);
  const instanceId = params.get('instance') ?? undefined;
  const targetInstance = instances.find((i) => i.id === instanceId);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<SearchSort>('relevance');
  const [loading, setLoading] = React.useState(true);
  const [results, setResults] = React.useState<Array<Project>>([]);
  const [installTarget, setInstallTarget] = React.useState<null | Project>(null);
  const [selectedProject, setSelectedProject] = React.useState<null | Project>(null);
  const [filters, setFilters] = React.useState<DiscoverFilters>({
    providers: [],
    loader: targetInstance?.loader,
    gameVersion: targetInstance?.gameVersion
  });
  const game = projectService.getGame(gameId);
  const categories = projectService.getCategories(gameId);

  React.useEffect(() => {
    if (targetInstance && targetInstance.gameId !== gameId) setSelectedGame(targetInstance.gameId);
  }, [gameId, setSelectedGame, targetInstance]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      void projectService.search({ sort, query, gameId, ...filters }).then((r) => {
        if (cancelled) return;
        setResults(r.items);
        setLoading(false);
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [gameId, query, sort, filters]);

  const toggleCategory = (c: string) => setFilters((f) => ({ ...f, category: f.category === c ? undefined : c }));

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Discover"
        description={targetInstance ? `Installing into ${targetInstance.name}` : 'One catalog across every provider.'}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} className="w-80" onChange={setQuery} placeholder={`Search ${game.name} mods`} />
        <Select value={sort} onValueChange={(v) => setSort(v as SearchSort)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {DISCOVER_SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  Sort: {s.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FilterPopover game={game} filters={filters} onChange={setFilters} categories={categories} />
        <span className="flex-1" />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {game.providers.map((p) => (
            <Badge key={p} variant="outline" className="gap-1.5 text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ background: getProviderMeta(p).color }} />
              {getProviderMeta(p).name}
            </Badge>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <Button
            key={c}
            size="xs"
            className="rounded-full"
            onClick={() => toggleCategory(c)}
            variant={filters.category === c ? 'default' : 'outline'}
          >
            {c}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border bg-card/40 p-1">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon={Compass} title="No results" description="Try another search or loosen the filters.">
          <Button variant="outline" onClick={() => setFilters({ providers: [] })}>
            Clear filters
          </Button>
        </EmptyState>
      ) : (
        <>
          <span className="text-xs text-muted-foreground">{results.length} results</span>
          <div className="rounded-lg border bg-card/40">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Versions</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((project) => {
                  const installed = targetInstance?.mods.some((mod) => mod.projectId === project.id);

                  return (
                    <TableRow
                      key={project.id}
                      data-project-row
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedProject(project);
                      }}
                    >
                      <TableCell className="min-w-96 whitespace-normal">
                        <div className="flex items-start gap-3">
                          <ProjectIcon size="md" name={project.name} color={project.iconColor} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedProject(project)}
                              className="block max-w-full truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              {project.name}
                            </button>
                            <span className="block truncate text-xs text-muted-foreground">by {project.author}</span>
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{project.summary}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProviderBadge providerId={project.provider.id} />
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-48 flex-wrap gap-1">
                          {project.categories.slice(0, 2).map((category) => (
                            <Badge key={category} variant="outline" className="text-muted-foreground">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Download className="size-3" />
                          {formatCompact(project.downloads)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatRelative(project.updatedAt)}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{project.gameVersions.slice(0, 2).join(', ')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="xs"
                          disabled={installed}
                          variant={installed ? 'secondary' : 'default'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setInstallTarget(project);
                          }}
                        >
                          {!installed && <Plus data-icon="inline-start" />}
                          {installed ? 'Installed' : 'Install'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {selectedProject && (
        <ProjectDetailsPanel
          project={selectedProject}
          onInstall={setInstallTarget}
          onClose={() => setSelectedProject(null)}
          installed={targetInstance?.mods.some((mod) => mod.projectId === selectedProject.id)}
        />
      )}

      <InstallDialog
        project={installTarget}
        instanceId={instanceId}
        open={installTarget !== null}
        onOpenChange={(o) => !o && setInstallTarget(null)}
      />
    </div>
  );
};

export default DiscoverPage;
