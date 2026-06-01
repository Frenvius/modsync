import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { Check, ChevronDown, ExternalLink, Loader2, Package, Plus, Search, Shuffle } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { useGame } from '~/usecase/contexts/GameContext';
import { formatDate } from '~/usecase/util/dateUtils';
import { formatDownloads } from '~/usecase/util/stringUtils';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { ModDetails } from '~/components/modpack/ModDetailPanel/types';
import { MarkdownContent } from '~/components/modpack/ModDetailPanel/MarkdownContent';

import { SelectVersionDialog } from '../SelectVersionDialog';
import { AddModWithDepsDialog } from '../AddModWithDepsDialog';

import { AddModsDialogProps, COMPAT_LAYERS, DependencyInfo, ModInfo, ModrinthMod, ModVersion, ModWithDependencies, SearchResult } from './types';

export function AddModsDialog({
  open,
  gameId,
  loader,
  modpackId,
  modpackName,
  onModsAdded,
  onOpenChange,
  existingMods,
  gameVersion
}: AddModsDialogProps) {
  const { games } = useGame();
  const game = games.find((g) => g.id === gameId);

  const [search, setSearch] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<ModrinthMod[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [loadingSlug, setLoadingSlug] = React.useState<null | string>(null);
  const [localExistingMods, setLocalExistingMods] = React.useState<string[]>(existingMods);

  const [versionDialogOpen, setVersionDialogOpen] = React.useState(false);
  const [selectedMod, setSelectedMod] = React.useState<null | ModrinthMod>(null);

  const [depsDialogOpen, setDepsDialogOpen] = React.useState(false);
  const [pendingModInfo, setPendingModInfo] = React.useState<null | ModInfo>(null);
  const [pendingDependencies, setPendingDependencies] = React.useState<DependencyInfo[]>([]);

  const [previewSlug, setPreviewSlug] = React.useState<string | null>(null);
  const [previewSource, setPreviewSource] = React.useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = React.useState<ModDetails | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const [cfUrl, setCfUrl] = React.useState('');
  const [cfLoading, setCfLoading] = React.useState(false);

  const { additionalLoaders, activeCompat } = React.useMemo(() => {
    const active = COMPAT_LAYERS.filter((c) => localExistingMods.includes(c.slug));
    const loaders = [...new Set(active.flatMap((c) => c.loaders))];
    return { additionalLoaders: loaders.length > 0 ? loaders : null, activeCompat: active };
  }, [localExistingMods]);

  React.useEffect(() => {
    setLocalExistingMods(existingMods);
  }, [existingMods]);

  React.useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      if (search.trim()) {
        performSearch(search);
      } else {
        performSearch('');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, open, gameVersion, loader, additionalLoaders]);

  React.useEffect(() => {
    if (open && !hasSearched) {
      performSearch('');
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setCfUrl('');
      setSearchResults([]);
      setHasSearched(false);
      setLoadingSlug(null);
      setPreviewSlug(null);
      setPreviewSource(null);
      setPreviewDetail(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!previewSlug) {
      setPreviewDetail(null);
      return;
    }

    setPreviewLoading(true);
    invoke<ModDetails>('get_mod_details', {
      slug: previewSlug,
      source: previewSource ?? game?.mod_source ?? 'modrinth',
      thunderstoreCommunity: game?.thunderstore_community ?? null,
      gameVersion: gameVersion || null,
      loader: loader || null,
      additionalLoaders: additionalLoaders
    })
      .then((detail) => setPreviewDetail(detail))
      .catch(() => setPreviewDetail(null))
      .finally(() => setPreviewLoading(false));
  }, [previewSlug, previewSource, game?.mod_source, game?.thunderstore_community, gameVersion, loader, additionalLoaders]);

  const performSearch = React.useCallback(
    async (query: string) => {
      setIsSearching(true);
      try {
        const result = await invoke<SearchResult>('search_mods', {
          gameId,
          limit: 20,
          loader: loader,
          additionalLoaders: additionalLoaders,
          query: query || null,
          gameVersion: gameVersion,
          sort: query ? 'relevance' : 'downloads'
        });
        setSearchResults(result.mods);
        setHasSearched(true);
      } catch (error) {
        console.error('Failed to search mods:', error);
        toast({
          title: 'Search failed',
          variant: 'destructive',
          description: 'Failed to search for mods. Please try again.'
        });
      } finally {
        setIsSearching(false);
      }
    },
    [gameId, gameVersion, loader, additionalLoaders]
  );

  const isModInModpack = (slug: string) => {
    return localExistingMods.includes(slug);
  };

  const handleSelectMod = (mod: ModrinthMod) => {
    setSelectedMod(mod);
    setVersionDialogOpen(true);
  };

  const handleAddLatest = async (mod: ModrinthMod) => {
    setLoadingSlug(mod.slug);
    try {
      const result = await invoke<ModWithDependencies>('get_mod_with_dependencies', {
        slug: mod.slug,
        loader: loader,
        additionalLoaders: additionalLoaders,
        gameVersion: gameVersion,
        source: mod.source ?? game?.mod_source ?? 'modrinth',
        thunderstoreCommunity: game?.thunderstore_community
      });

      const uninstalledRequiredDeps = result.dependencies.filter(
        (dep) => dep.dependency_type === 'required' && !localExistingMods.includes(dep.slug)
      );

      const modInfoWithAuthor = {
        ...result.mod_info,
        author: result.mod_info.author === 'Unknown' && mod.author ? mod.author : result.mod_info.author
      };

      if (uninstalledRequiredDeps.length > 0) {
        setPendingModInfo(modInfoWithAuthor);
        setPendingDependencies(result.dependencies);
        setDepsDialogOpen(true);
      } else {
        await invoke('add_mod_to_modpack', {
          modpackId,
          projectId: null,
          slug: modInfoWithAuthor.slug,
          title: modInfoWithAuthor.title,
          author: modInfoWithAuthor.author,
          iconUrl: modInfoWithAuthor.icon_url,
          versionId: modInfoWithAuthor.version_id,
          version: modInfoWithAuthor.version_number,
          source: modInfoWithAuthor.source ?? null,
          filename: modInfoWithAuthor.filename ?? null
        });

        toast({
          title: 'Mod added',
          description: `"${result.mod_info.title}" has been added to "${modpackName}".`
        });

        setLocalExistingMods((prev) => [...prev, result.mod_info.slug]);
        onModsAdded?.();
      }
    } catch (error) {
      console.error('Failed to add mod:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: `Failed to add mod: ${error}`
      });
    } finally {
      setLoadingSlug(null);
    }
  };

  const handleVersionSelect = async (version: ModVersion) => {
    if (!selectedMod) return;

    const isUpdating = localExistingMods.includes(selectedMod.slug);
    setLoadingSlug(selectedMod.slug);

    try {
      if (isUpdating) {
        await invoke('remove_mod_from_modpack', {
          modpackId,
          slug: selectedMod.slug
        });
      }

      const result = await invoke<ModWithDependencies>('get_mod_with_dependencies', {
        loader: loader,
        additionalLoaders: additionalLoaders,
        slug: selectedMod.slug,
        gameVersion: gameVersion,
        source: selectedMod.source ?? game?.mod_source ?? 'modrinth',
        thunderstoreCommunity: game?.thunderstore_community
      });

      const modInfo: ModInfo = {
        slug: selectedMod.slug,
        version_id: version.id,
        title: selectedMod.title,
        author: selectedMod.author,
        icon_url: selectedMod.icon_url,
        version_number: version.version_number,
        source: result.mod_info.source,
        filename: result.mod_info.filename
      };

      const uninstalledRequiredDeps = result.dependencies.filter(
        (dep) => dep.dependency_type === 'required' && !localExistingMods.includes(dep.slug)
      );

      if (!isUpdating && uninstalledRequiredDeps.length > 0) {
        setPendingModInfo(modInfo);
        setPendingDependencies(result.dependencies);
        setDepsDialogOpen(true);
      } else {
        await invoke('add_mod_to_modpack', {
          modpackId,
          projectId: null,
          slug: modInfo.slug,
          title: modInfo.title,
          author: modInfo.author,
          iconUrl: modInfo.icon_url,
          versionId: modInfo.version_id,
          version: modInfo.version_number,
          source: modInfo.source ?? null,
          filename: modInfo.filename ?? null
        });

        toast({
          title: isUpdating ? 'Version changed' : 'Mod added',
          description: `"${modInfo.title}" v${modInfo.version_number} ${isUpdating ? 'updated' : 'added'}.`
        });

        if (!isUpdating) {
          setLocalExistingMods((prev) => [...prev, modInfo.slug]);
        }
        onModsAdded?.();
      }
    } catch (error) {
      console.error('Failed to add/update mod:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: `Failed to ${isUpdating ? 'update' : 'add'} mod: ${error}`
      });
    } finally {
      setLoadingSlug(null);
      setSelectedMod(null);
    }
  };

  const handleDepsDialogSuccess = () => {
    if (pendingModInfo) {
      setLocalExistingMods((prev) => [...prev, pendingModInfo.slug]);
    }
    pendingDependencies.forEach((dep) => {
      if (!localExistingMods.includes(dep.slug)) {
        setLocalExistingMods((prev) => [...prev, dep.slug]);
      }
    });
    onModsAdded?.();
  };

  const handleCurseForgeImport = async () => {
    if (!cfUrl.trim()) return;
    setCfLoading(true);
    try {
      const mod = await invoke<ModrinthMod>('resolve_curseforge_url', { url: cfUrl.trim() });
      const already = searchResults.some((m) => m.slug === mod.slug);
      if (!already) {
        setSearchResults((prev) => [mod, ...prev]);
      }
      setCfUrl('');
      toast({
        title: 'Mod found',
        description: `"${mod.title}" loaded from CurseForge.`
      });
    } catch (error) {
      toast({
        title: 'Import failed',
        variant: 'destructive',
        description: `${error}`
      });
    } finally {
      setCfLoading(false);
    }
  };

  const fmtDownloads = (downloads: number): string => {
    if (downloads >= 1000000) return `${(downloads / 1000000).toFixed(1)}M`;
    if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}K`;
    return downloads.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 1060, height: '80vh' }} className="p-0 gap-0 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add Mods</h2>
            <p className="text-sm text-muted-foreground">
              Search for mods compatible with {gameVersion}
              {loader ? ` (${loader})` : ''}
            </p>
            {activeCompat.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                <Shuffle className="w-3 h-3 text-primary" />
                <span className="text-xs text-primary">
                  Cross-loader: {activeCompat.map((c) => c.label).join(', ')} — also showing{' '}
                  {additionalLoaders!.join(', ')} mods
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div style={{ width: 460, minWidth: 460 }} className="flex flex-col">
            <div className="px-4 py-3 space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} className="pl-9" placeholder="Search mods..." onChange={(e) => setSearch(e.target.value)} />
              </div>
              {gameId === 'minecraft' && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Import from CurseForge</Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={cfUrl}
                      className="h-7 text-xs"
                      placeholder="CurseForge URL or slug (e.g. alexs-delight)"
                      onChange={(e) => setCfUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCurseForgeImport()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cfLoading || !cfUrl.trim()}
                      onClick={handleCurseForgeImport}
                      className="h-7 px-2 shrink-0"
                    >
                      {cfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              <div className="px-4 pb-4 space-y-1.5">
                {isSearching ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Package className="w-10 h-10 mb-2 opacity-50" />
                    <p className="text-sm">{hasSearched ? 'No mods found' : 'Search for mods to add'}</p>
                  </div>
                ) : (
                  searchResults.map((mod) => {
                    const isInModpack = isModInModpack(mod.slug);
                    const isLoading = loadingSlug === mod.slug;
                    const isSelected = previewSlug === mod.slug;

                    return (
                      <div
                        key={mod.slug}
                        onClick={() => {
                          const isToggle = mod.slug === previewSlug;
                          setPreviewSlug(isToggle ? null : mod.slug);
                          setPreviewSource(isToggle ? null : mod.source ?? null);
                        }}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-accent border border-primary/40'
                            : 'bg-card border border-border hover:bg-card-hover hover:border-border'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {mod.icon_url ? (
                            <img alt={mod.title} src={mod.icon_url} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-medium text-sm text-foreground truncate">{mod.title}</h3>
                            {mod.source === 'curseforge' && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 shrink-0 border-orange-500/50 text-orange-500 bg-orange-500/10">
                                CF
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            by {mod.author} • {fmtDownloads(mod.downloads)} downloads
                          </p>
                        </div>
                        <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isInModpack ? (
                            <div className="flex items-center gap-1 text-primary px-2 h-7">
                              <Check className="w-3 h-3" />
                              <span className="text-xs">Added</span>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddLatest(mod)}
                              disabled={isLoading || loadingSlug !== null}
                              className="rounded-r-none border-r-0 gap-1 h-7 px-2"
                            >
                              {isLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="w-3 h-3" />
                                  Add
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectMod(mod)}
                            disabled={isLoading || loadingSlug !== null}
                            title={isInModpack ? 'Change version' : 'Choose version'}
                            className={`h-7 px-1.5 ${isInModpack ? '' : 'rounded-l-none'}`}
                          >
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-card border-l border-border" style={{ minWidth: 0 }}>
            {previewSlug && previewLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : previewSlug && previewDetail ? (
              <ModPreview detail={previewDetail} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                <Package className="w-12 h-12 opacity-30" />
                <p className="text-sm text-center">Click on a mod to see its details</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      <SelectVersionDialog
        loader={loader}
        additionalLoaders={additionalLoaders}
        mod={selectedMod}
        open={versionDialogOpen}
        onOpenChange={setVersionDialogOpen}
        gameVersion={gameVersion}
        onVersionSelect={handleVersionSelect}
      />
      <AddModWithDepsDialog
        open={depsDialogOpen}
        modpackId={modpackId}
        modInfo={pendingModInfo}
        modpackName={modpackName}
        onOpenChange={setDepsDialogOpen}
        existingMods={localExistingMods}
        dependencies={pendingDependencies}
        onSuccess={handleDepsDialogSuccess}
      />
    </Dialog>
  );
}

const ModPreview = React.memo(function ModPreview({ detail }: { detail: ModDetails }) {
  const readmeContent = detail.readme ?? detail.body;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0">
            {detail.icon_url ? (
              <img alt={detail.title} src={detail.icon_url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate">{detail.title}</h3>
            <p className="text-xs text-muted-foreground">by {detail.author}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {detail.latest_version && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  v{detail.latest_version}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">{formatDownloads(detail.downloads)} downloads</span>
              {detail.date_updated && (
                <span className="text-[10px] text-muted-foreground">{formatDate(detail.date_updated)}</span>
              )}
            </div>
          </div>
        </div>
        {detail.description && (
          <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{detail.description}</p>
        )}
        {detail.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {detail.categories.slice(0, 5).map((cat) => (
              <Badge key={cat} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {cat}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {detail.dependencies.length > 0 && (
        <div className="px-4 py-2 border-b border-border shrink-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Dependencies ({detail.dependencies.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {detail.dependencies.map((dep) => (
              <Badge
                key={dep.slug}
                variant={dep.dependency_type === 'required' ? 'secondary' : 'outline'}
                className="text-[10px] px-1.5 py-0 h-4"
              >
                {dep.title || dep.slug}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        <MarkdownContent content={readmeContent} emptyMessage="No description available" />
      </div>
    </div>
  );
});
