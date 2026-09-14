import type { DiscoverFilters } from '~/components/Discover/types';
import type { Project, SearchSort } from '~/domain/interfaces/project.interface';

import React from 'react';
import { useSearchParams } from 'react-router-dom';

import { toast } from 'sonner';
import { X, Check, Clock, Compass, Download, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

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
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { formatCompact, formatRelative } from '~/usecase/util/formatUtils';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import ProjectDetailsPanel from '~/components/Discover/ProjectDetailsPanel';
import { Table, TableRow, TableBody, TableCell, TableHead, TableHeader } from '~/components/ui/table';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';

import { DISCOVER_SORTS } from './constants';

const DiscoverPage = () => {
  const [params] = useSearchParams();
  const instances = useAppStore((s) => s.instances);
  const installMod = useAppStore((s) => s.installMod);
  const selectedGameId = useAppStore((s) => s.selectedGameId);
  const setSelectedGame = useAppStore((s) => s.setSelectedGame);
  const instanceId = params.get('instance') ?? undefined;
  const targetInstance = instances.find((i) => i.id === instanceId);
  const gameId = targetInstance?.gameId ?? selectedGameId;
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<SearchSort>('relevance');
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [stale, setStale] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [errors, setErrors] = React.useState<Array<string>>([]);
  const [results, setResults] = React.useState<Array<Project>>([]);
  const [categories, setCategories] = React.useState<Array<string>>([]);
  const [dialogProject, setDialogProject] = React.useState<null | Project>(null);
  const [installingProjectId, setInstallingProjectId] = React.useState<string>();
  const [selectedProject, setSelectedProject] = React.useState<null | Project>(null);
  const [openCategoryProjectId, setOpenCategoryProjectId] = React.useState<null | string>(null);
  const categoryMenuCloseTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const categoriesGame = React.useRef<typeof gameId>(undefined);
  const [filters, setFilters] = React.useState<DiscoverFilters>({
    providers: [],
    loader: targetInstance?.loader,
    gameVersion: targetInstance?.gameVersion
  });
  const game = projectService.getGame(gameId);
  const installedProjectIds = new Set(targetInstance?.mods.map((mod) => mod.projectId));
  const cancelCategoryMenuClose = () => clearTimeout(categoryMenuCloseTimer.current);
  const scheduleCategoryMenuClose = () => {
    categoryMenuCloseTimer.current = setTimeout(() => setOpenCategoryProjectId(null), 100);
  };
  const openCategoryMenu = (projectId: string) => {
    cancelCategoryMenuClose();
    setOpenCategoryProjectId(projectId);
  };

  React.useEffect(() => () => clearTimeout(categoryMenuCloseTimer.current), []);

  React.useEffect(() => {
    if (targetInstance && targetInstance.gameId !== selectedGameId) setSelectedGame(targetInstance.gameId);
  }, [selectedGameId, setSelectedGame, targetInstance]);

  React.useEffect(() => {
    setFilters((current) => ({
      ...current,
      loader: targetInstance?.loader,
      gameVersion: targetInstance?.gameVersion
    }));
  }, [instanceId, targetInstance?.gameVersion, targetInstance?.loader]);

  React.useEffect(() => {
    categoriesGame.current = undefined;
    setCategories([]);
  }, [gameId]);

  React.useEffect(() => setPage(0), [gameId, query, sort, filters]);

  React.useEffect(() => {
    let cancelled = false;
    setStale(false);
    setErrors([]);
    setLoading(true);
    const handle = setTimeout(() => {
      void projectService.search({ page, sort, query, gameId, ...filters }).then((result) => {
        if (cancelled) return;
        setTotal(result.total);
        setStale(result.stale);
        setResults(result.items);
        setErrors(result.providerErrors.map((error) => error.message));
        setLoading(false);
        if (categoriesGame.current !== gameId) {
          categoriesGame.current = gameId;
          void projectService.getCategories(gameId).then((categoryResult) => {
            if (!cancelled) setCategories(categoryResult.items);
          });
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [page, gameId, query, sort, filters]);

  const installFromPanel = async (project: Project) => {
    if (!targetInstance) {
      setDialogProject(project);
      return;
    }
    setInstallingProjectId(project.id);
    try {
      await installMod(targetInstance.id, project);
      toast.success(`${project.name} installed to ${targetInstance.name}`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Could not install ${project.name}`));
    } finally {
      setInstallingProjectId(undefined);
    }
  };
  const clearFilters = () => setFilters({ providers: [] });
  const clearFilter = (key: keyof DiscoverFilters) =>
    setFilters((current) => ({ ...current, [key]: key === 'providers' ? [] : undefined }));

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Discover"
        description={targetInstance ? `Compatible content for ${targetInstance.name}` : 'One catalog across every provider.'}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          value={query}
          onChange={setQuery}
          className="min-w-64 flex-1 sm:max-w-md"
          placeholder={`Search ${game.name} mods`}
        />
        <Select value={sort} onValueChange={(v) => setSort(v as SearchSort)}>
          <SelectTrigger className="w-44" aria-label="Sort discovered projects">
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
        <div className="ml-auto flex items-center gap-1">
          {game.providers.map((providerId) => (
            <ProviderBadge key={providerId} providerId={providerId} />
          ))}
        </div>
      </div>

      {(filters.gameVersion || filters.loader || filters.category || filters.providers.length > 0) && (
        <div role="group" aria-label="Active filters" className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtered by</span>
          {filters.gameVersion && (
            <Button size="xs" variant="secondary" onClick={() => clearFilter('gameVersion')}>
              Version: {filters.gameVersion}
              <X data-icon="inline-end" />
            </Button>
          )}
          {filters.loader && (
            <Button size="xs" variant="secondary" className="capitalize" onClick={() => clearFilter('loader')}>
              Loader: {filters.loader}
              <X data-icon="inline-end" />
            </Button>
          )}
          {filters.category && (
            <Button size="xs" variant="secondary" onClick={() => clearFilter('category')}>
              Category: {filters.category}
              <X data-icon="inline-end" />
            </Button>
          )}
          {filters.providers.length > 0 && (
            <Button size="xs" variant="secondary" onClick={() => clearFilter('providers')}>
              Providers: {filters.providers.map((providerId) => getProviderMeta(providerId).name).join(', ')}
              <X data-icon="inline-end" />
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      )}

      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Some providers are unavailable</AlertTitle>
          <AlertDescription>{errors.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      {stale ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Showing cached provider data</AlertTitle>
          <AlertDescription>Live provider data could not be refreshed.</AlertDescription>
        </Alert>
      ) : null}

      {loading && results.length === 0 ? (
        <>
          <Skeleton className="h-4 w-20" />
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table className="min-w-[900px]">
              <TableHeader className="bg-secondary/70">
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                  <TableHead>Versions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : results.length === 0 ? (
        <EmptyState icon={Compass} title="No results" description="Try another search or loosen the filters.">
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        </EmptyState>
      ) : (
        <>
          <span className="text-xs text-muted-foreground">{total} results</span>
          <div
            aria-busy={loading}
            data-loading={loading}
            className="overflow-hidden rounded-lg border bg-card data-[loading=true]:opacity-60"
          >
            <Table className="min-w-[900px]">
              <TableHeader className="bg-secondary/70">
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead className="text-right">Downloads</TableHead>
                  <TableHead>Versions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr:nth-child(even)]:bg-muted/25">
                {results.map((project) => {
                  const installed = installedProjectIds.has(project.id);
                  return (
                    <TableRow
                      key={project.id}
                      data-project-row
                      data-state={selectedProject?.id === project.id ? 'selected' : undefined}
                      className="cursor-pointer hover:bg-accent/60 data-[state=selected]:bg-primary/15"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedProject(project);
                      }}
                    >
                      <TableCell className="min-w-96 whitespace-normal">
                        <div className="flex items-start gap-3">
                          <ProjectIcon size="md" name={project.name} color={project.iconColor} imageUrl={project.iconUrl} />
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-baseline gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedProject(project)}
                                className="min-w-0 truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                              >
                                {project.name}
                              </button>
                              {installed ? (
                                <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                                  <Check aria-hidden="true" className="size-3" />
                                  Installed
                                </Badge>
                              ) : null}
                              <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground">
                                by {project.author}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{project.summary}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatRelative(project.updatedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ProviderBadge providerId={project.provider.id} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {project.categories.slice(0, 1).map((category) => (
                            <Badge key={category} variant="outline" className="bg-secondary/70 text-secondary-foreground">
                              {category}
                            </Badge>
                          ))}
                          {project.categories.length > 1 && (
                            <DropdownMenu
                              modal={false}
                              open={openCategoryProjectId === project.id}
                              onOpenChange={(open) => setOpenCategoryProjectId(open ? project.id : null)}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon-xs"
                                  variant="outline"
                                  onPointerLeave={scheduleCategoryMenuClose}
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerEnter={() => openCategoryMenu(project.id)}
                                  aria-label={`+${project.categories.length - 1} more categories`}
                                  className="rounded-md bg-secondary/70 text-[10px] text-secondary-foreground"
                                >
                                  +{project.categories.length - 1}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                onPointerEnter={cancelCategoryMenuClose}
                                onPointerLeave={scheduleCategoryMenuClose}
                              >
                                <DropdownMenuGroup>
                                  {project.categories.slice(1).map((category) => (
                                    <DropdownMenuItem key={category}>{category}</DropdownMenuItem>
                                  ))}
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Download className="size-3" />
                          {formatCompact(project.downloads)}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{project.gameVersions.slice(0, 2).join(', ')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <nav aria-label="Search pages" className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft data-icon="inline-start" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <Button size="sm" variant="outline" disabled={(page + 1) * 20 >= total} onClick={() => setPage((value) => value + 1)}>
              Next
              <ChevronRight data-icon="inline-end" />
            </Button>
          </nav>
        </>
      )}

      {selectedProject ? (
        <ProjectDetailsPanel
          project={selectedProject}
          instance={targetInstance}
          onClose={() => setSelectedProject(null)}
          installed={installedProjectIds.has(selectedProject.id)}
          installing={installingProjectId === selectedProject.id}
          onInstall={() => void installFromPanel(selectedProject)}
        />
      ) : null}
      <InstallDialog
        project={dialogProject}
        open={Boolean(dialogProject)}
        onOpenChange={(open) => setDialogProject(open ? dialogProject : null)}
      />
    </div>
  );
};

export default DiscoverPage;
