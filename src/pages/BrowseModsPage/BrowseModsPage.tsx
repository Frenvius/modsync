import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { ArrowDownAZ, Clock, Loader2, Search, Sparkles, Star, TrendingUp } from 'lucide-react';

import { ActiveFilterBadges, TagMultiSelect } from '~/components/TagMultiSelect';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '~/components/ui/pagination';
import { ModCard } from '~/components/modpack/ModCard';
import { useGame } from '~/usecase/contexts/GameContext';
import { AppLayout } from '~/components/layout/AppLayout/AppLayout';
import { ModDetailPanel } from '~/components/modpack/ModDetailPanel';
import { ModDetails } from '~/components/modpack/ModDetailPanel/types';
import { capitalize, formatDownloads } from '~/usecase/util/stringUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

import { Category, FetchProgress, GameVersion, ModLoader, ModrinthMod, SearchResult } from './types';

export default function BrowseModsPage() {
  const { selectedGame } = useGame();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const [excludedCategories, setExcludedCategories] = React.useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = React.useState('');
  const [selectedLoader, setSelectedLoader] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('downloads');
  const [installedMods, setInstalledMods] = React.useState<string[]>([]);

  const [mods, setMods] = React.useState<ModrinthMod[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [gameVersions, setGameVersions] = React.useState<GameVersion[]>([]);
  const [loaders, setLoaders] = React.useState<ModLoader[]>([]);

  const [loading, setLoading] = React.useState(false);
  const [totalHits, setTotalHits] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [error, setError] = React.useState<null | string>(null);
  const [fetchProgress, setFetchProgress] = React.useState<FetchProgress | null>(null);

  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  const [selectedModSlug, setSelectedModSlug] = React.useState<string | null>(null);
  const [modDetail, setModDetail] = React.useState<ModDetails | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = React.useState(60);
  const isDragging = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleDividerMouseDown = React.useCallback(() => {
    isDragging.current = true;
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPanelWidth(Math.min(75, Math.max(40, newWidth)));
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const gameId = selectedGame?.id ?? 'minecraft';
  const requiresLoader = selectedGame?.requires_loader ?? true;
  const isThunderstore = selectedGame?.mod_source === 'thunderstore';
  const thunderstoreCommunity = selectedGame?.thunderstore_community;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  React.useEffect(() => {
    setMods([]);
    setSelectedCategories([]);
    setExcludedCategories([]);
    setSelectedVersion('');
    setSelectedLoader('all');
    setSortBy('downloads');
    setSelectedModSlug(null);
    setModDetail(null);
  }, [gameId]);

  React.useEffect(() => {
    async function loadFilters() {
      try {
        if (requiresLoader) {
          const [cats, versions, ldrs] = await Promise.all([
            invoke<Category[]>('get_mod_categories', { gameId }),
            invoke<GameVersion[]>('get_game_versions', { gameId }),
            invoke<ModLoader[]>('get_mod_loaders', { gameId })
          ]);

          setCategories(cats);
          setGameVersions(versions.slice(0, 20));
          setLoaders(ldrs.filter((l) => l.supported_project_types.includes('mod')));

          if (versions.length > 0) {
            setSelectedVersion(versions[0].version);
          }
        } else {
          const cats = await invoke<Category[]>('get_mod_categories', { gameId });
          setCategories(cats);
          setGameVersions([]);
          setLoaders([]);
        }
      } catch (err) {
        console.error('Failed to load filters:', err);
      }
    }
    loadFilters();
  }, [gameId, requiresLoader]);

  React.useEffect(() => {
    if (!loading || !isThunderstore || !thunderstoreCommunity) return;

    const interval = setInterval(async () => {
      try {
        const progress = await invoke<FetchProgress | null>('get_thunderstore_fetch_progress', {
          community: thunderstoreCommunity
        });
        setFetchProgress(progress);
      } catch {}
    }, 500);

    return () => {
      clearInterval(interval);
      setFetchProgress(null);
    };
  }, [loading, isThunderstore, thunderstoreCommunity]);

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(totalHits / ITEMS_PER_PAGE);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedQuery, selectedVersion, selectedLoader, selectedCategories, excludedCategories, sortBy]);

  React.useEffect(() => {
    async function searchMods() {
      setLoading(true);
      setError(null);

      try {
        const result = await invoke<SearchResult>('search_mods', {
          gameId,
          offset: (currentPage - 1) * ITEMS_PER_PAGE,
          limit: ITEMS_PER_PAGE,
          sort: sortBy,
          query: debouncedQuery || null,
          gameVersion: selectedVersion || null,
          loader: requiresLoader && selectedLoader !== 'all' ? selectedLoader : null,
          categories: selectedCategories.length > 0 ? selectedCategories.map((c) => c.toLowerCase()) : null,
          excludedCategories: excludedCategories.length > 0 ? excludedCategories.map((c) => c.toLowerCase()) : null
        });

        setMods(result.mods);
        setTotalHits(result.total_hits);
      } catch (err) {
        setError(err as string);
        console.error('Search failed:', err);
      } finally {
        setLoading(false);
      }
    }

    searchMods();
  }, [gameId, debouncedQuery, selectedVersion, selectedLoader, selectedCategories, excludedCategories, sortBy, currentPage]);

  React.useEffect(() => {
    if (!selectedModSlug) {
      setModDetail(null);
      setDetailError(null);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    invoke<ModDetails>('get_mod_details', {
      slug: selectedModSlug,
      source: selectedGame?.mod_source ?? 'modrinth',
      thunderstoreCommunity: thunderstoreCommunity ?? null,
      gameVersion: selectedVersion || null,
      loader: requiresLoader && selectedLoader !== 'all' ? selectedLoader : null
    })
      .then((detail) => setModDetail(detail))
      .catch((err) => setDetailError(String(err)))
      .finally(() => setDetailLoading(false));
  }, [selectedModSlug, selectedGame?.mod_source, thunderstoreCommunity, selectedVersion, selectedLoader, requiresLoader]);


  const handleToggleMod = React.useCallback((modSlug: string) => {
    setInstalledMods((prev) => (prev.includes(modSlug) ? prev.filter((n) => n !== modSlug) : [...prev, modSlug]));
  }, []);

  const categoryNames = React.useMemo(() => categories.map((c) => capitalize(c.name)), [categories]);

  const sourceLabel = isThunderstore ? 'Thunderstore' : 'Modrinth';

  const sortOptions = React.useMemo(
    () =>
      isThunderstore
        ? [
            { value: 'downloads', label: 'Downloads', icon: TrendingUp },
            { value: 'updated', label: 'Recently Updated', icon: Clock },
            { value: 'follows', label: 'Rating', icon: Star },
            { value: 'name', label: 'Alphabetical', icon: ArrowDownAZ }
          ]
        : [
            { value: 'relevance', label: 'Relevance', icon: Sparkles },
            { value: 'downloads', label: 'Downloads', icon: TrendingUp },
            { value: 'updated', label: 'Recently Updated', icon: Clock },
            { value: 'follows', label: 'Follows', icon: Star }
          ],
    [isThunderstore]
  );

  const pageNumbers = React.useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  const modListContent = (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Browse Mods</h1>
        <p className="text-muted-foreground mt-1">Discover and add mods from {sourceLabel} to your modpacks</p>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            placeholder="Search mods..."
            className="pl-10 bg-secondary h-11"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          {requiresLoader && (
            <>
              <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Version" />
                </SelectTrigger>
                <SelectContent>
                  {gameVersions.map((v) => (
                    <SelectItem key={v.version} value={v.version}>
                      {v.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedLoader} onValueChange={setSelectedLoader}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Loader" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Loaders</SelectItem>
                  {loaders.map((l) => (
                    <SelectItem key={l.name} value={l.name}>
                      {capitalize(l.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {categoryNames.length > 0 && (
            <>
              <TagMultiSelect
                categories={categoryNames}
                selected={selectedCategories}
                onSelectedChange={setSelectedCategories}
                disabledItems={excludedCategories}
                label="Tags"
              />
              <TagMultiSelect
                categories={categoryNames}
                selected={excludedCategories}
                onSelectedChange={setExcludedCategories}
                disabledItems={selectedCategories}
                label="Exclude"
                variant="destructive"
              />
            </>
          )}
        </div>
      </div>
      {(selectedCategories.length > 0 || excludedCategories.length > 0) && (
        <ActiveFilterBadges
          selectedCategories={selectedCategories}
          excludedCategories={excludedCategories}
          onRemoveSelected={(cat) => setSelectedCategories((prev) => prev.filter((c) => c !== cat))}
          onRemoveExcluded={(cat) => setExcludedCategories((prev) => prev.filter((c) => c !== cat))}
        />
      )}
      {!loading && <p className="text-sm text-muted-foreground">{totalHits.toLocaleString()} mods found</p>}
      {error && (
        <div className="text-center py-8">
          <p className="text-destructive">Failed to load mods: {error}</p>
          <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          {fetchProgress && fetchProgress.is_loading && fetchProgress.total_chunks > 0 && (
            <div className="w-64 space-y-2">
              <Progress value={(fetchProgress.chunks_downloaded / fetchProgress.total_chunks) * 100} />
              <p className="text-sm text-muted-foreground text-center">
                Loading package database... {fetchProgress.chunks_downloaded}/{fetchProgress.total_chunks} chunks
              </p>
            </div>
          )}
        </div>
      )}
      {!loading && !error && (
        <div className="space-y-3">
          {mods.map((mod) => (
            <ModCard
              key={mod.slug}
              slug={mod.slug}
              name={mod.title}
              author={mod.author}
              description={mod.description}
              iconUrl={mod.icon_url || undefined}
              onAdd={() => handleToggleMod(mod.slug)}
              onSelect={() => setSelectedModSlug((prev) => (prev === mod.slug ? null : mod.slug))}
              isSelected={selectedModSlug === mod.slug}
              downloads={formatDownloads(mod.downloads)}
              isInstalled={installedMods.includes(mod.slug)}
              dateModified={mod.date_modified}
              categories={mod.categories.map((c) => capitalize(c))}
              isDeprecated={mod.is_deprecated}
            />
          ))}
        </div>
      )}
      {!loading && !error && totalPages > 1 && (
        <Pagination className="pt-4">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                className={currentPage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
              />
            </PaginationItem>
            {pageNumbers.map((page, i) =>
              page === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationLink
                    className="cursor-pointer"
                    isActive={currentPage === page}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
      {!loading && !error && mods.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No mods found matching your criteria</p>
        </div>
      )}
    </div>
  );

  if (selectedModSlug) {
    return (
      <AppLayout fullBleed>
        <div ref={containerRef} className="flex-1 flex overflow-hidden">
          <div style={{ width: `${leftPanelWidth}%` }} className="flex-shrink-0 overflow-auto p-6">
            {modListContent}
          </div>
          <div className="w-1 bg-border hover:bg-primary/50 cursor-col-resize flex-shrink-0" onMouseDown={handleDividerMouseDown} />
          <div className="flex-1 overflow-hidden border-l border-border">
            <ModDetailPanel
              mod={modDetail}
              loading={detailLoading}
              error={detailError}
              onClose={() => {
                setSelectedModSlug(null);
                setModDetail(null);
              }}
              mode="browse"
            />
          </div>
        </div>
      </AppLayout>
    );
  }

  return <AppLayout>{modListContent}</AppLayout>;
}
