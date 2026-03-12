import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { Check, ChevronDown, Loader2, Package, Plus, Search } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { useGame } from '~/usecase/contexts/GameContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { SelectVersionDialog } from '../SelectVersionDialog';
import { AddModWithDepsDialog } from '../AddModWithDepsDialog';

import { AddModsDialogProps, DependencyInfo, ModInfo, ModrinthMod, ModVersion, ModWithDependencies, SearchResult } from './types';

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
  }, [search, open, gameVersion, loader]);

  React.useEffect(() => {
    if (open && !hasSearched) {
      performSearch('');
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setSearchResults([]);
      setHasSearched(false);
      setLoadingSlug(null);
    }
  }, [open]);

  const performSearch = React.useCallback(
    async (query: string) => {
      setIsSearching(true);
      try {
        const result = await invoke<SearchResult>('search_mods', {
          gameId,
          limit: 20,
          loader: loader,
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
    [gameId, gameVersion, loader]
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
        gameVersion: gameVersion,
        source: game?.mod_source ?? 'modrinth',
        thunderstoreCommunity: game?.thunderstore_community
      });

      const newDependencies = result.dependencies.filter((dep) => !localExistingMods.includes(dep.slug));

      if (newDependencies.length > 0 || result.dependencies.length > 0) {
        setPendingModInfo(result.mod_info);
        setPendingDependencies(result.dependencies);
        setDepsDialogOpen(true);
      } else {
        await invoke('add_mod_to_modpack', {
          modpackId,
          projectId: null,
          slug: result.mod_info.slug,
          title: result.mod_info.title,
          author: result.mod_info.author,
          iconUrl: result.mod_info.icon_url,
          versionId: result.mod_info.version_id,
          version: result.mod_info.version_number
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
        slug: selectedMod.slug,
        gameVersion: gameVersion,
        source: game?.mod_source ?? 'modrinth',
        thunderstoreCommunity: game?.thunderstore_community
      });

      const modInfo: ModInfo = {
        slug: selectedMod.slug,
        version_id: version.id,
        title: selectedMod.title,
        author: selectedMod.author,
        icon_url: selectedMod.icon_url,
        version_number: version.version_number
      };

      const newDependencies = result.dependencies.filter((dep) => !localExistingMods.includes(dep.slug));

      if (!isUpdating && (newDependencies.length > 0 || result.dependencies.length > 0)) {
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
          version: modInfo.version_number
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

  const formatDownloads = (downloads: number): string => {
    if (downloads >= 1000000) {
      return `${(downloads / 1000000).toFixed(1)}M`;
    } else if (downloads >= 1000) {
      return `${(downloads / 1000).toFixed(1)}K`;
    }
    return downloads.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Mods</DialogTitle>
          <DialogDescription>
            Search for mods compatible with {gameVersion}
            {loader ? ` (${loader})` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} className="pl-9" placeholder="Search mods..." onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="overflow-y-auto space-y-2 h-[350px]">
          {isSearching ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Package className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">{hasSearched ? 'No mods found' : 'Search for mods to add'}</p>
            </div>
          ) : (
            searchResults.map((mod) => {
              const isInModpack = isModInModpack(mod.slug);
              const isLoading = loadingSlug === mod.slug;

              return (
                <div
                  key={mod.slug}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:bg-card-hover transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {mod.icon_url ? (
                      <img alt={mod.title} src={mod.icon_url} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-foreground truncate">{mod.title}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      by {mod.author} • {formatDownloads(mod.downloads)} downloads
                    </p>
                  </div>
                  <div className="flex items-center shrink-0">
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
      </DialogContent>
      <SelectVersionDialog
        loader={loader}
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
