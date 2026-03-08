import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { Check, Loader2, Package } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { useGame } from '~/contexts/GameContext';
import { toast } from '~/usecase/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { AddModWithDepsDialog } from '../AddModWithDepsDialog';

import { AddToModpackDialogProps, DependencyInfo, ModInfo, Modpack, ModWithDependencies } from './types';

export function AddToModpackDialog({
  open,
  modSlug,
  modName,
  onAdded,
  onOpenChange,
  modAuthor: _modAuthor,
  modIconUrl: _modIconUrl
}: AddToModpackDialogProps) {
  const { games } = useGame();
  const [selectedModpack, setSelectedModpack] = React.useState<null | string>(null);
  const [modpacks, setModpacks] = React.useState<Modpack[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);

  const [depsDialogOpen, setDepsDialogOpen] = React.useState(false);
  const [pendingModInfo, setPendingModInfo] = React.useState<null | ModInfo>(null);
  const [pendingDependencies, setPendingDependencies] = React.useState<DependencyInfo[]>([]);
  const [pendingModpackId, setPendingModpackId] = React.useState<null | string>(null);
  const [pendingModpackName, setPendingModpackName] = React.useState<string>('');
  const [pendingExistingMods, setPendingExistingMods] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      loadModpacks();
    } else {
      setSelectedModpack(null);
    }
  }, [open]);

  const loadModpacks = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<Modpack[]>('list_modpacks');
      setModpacks(data);
    } catch (error) {
      console.error('Failed to load modpacks:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: 'Failed to load modpacks'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isModInModpack = (modpack: Modpack) => {
    return modpack.mods.some((m) => m.slug === modSlug);
  };

  const handleAdd = async () => {
    if (!selectedModpack) return;

    const modpack = modpacks.find((m) => m.id === selectedModpack);
    if (!modpack) return;

    const game = games.find((g) => g.id === modpack.game_id);

    setIsAdding(true);
    try {
      const result = await invoke<ModWithDependencies>('get_mod_with_dependencies', {
        slug: modSlug,
        loader: modpack.loader,
        gameVersion: modpack.game_version || modpack.minecraft_version,
        source: game?.mod_source ?? 'modrinth',
        thunderstoreCommunity: game?.thunderstore_community
      });

      const existingSlugs = modpack.mods.map((m) => m.slug);

      if (result.dependencies.length > 0) {
        setPendingModInfo(result.mod_info);
        setPendingDependencies(result.dependencies);
        setPendingModpackId(modpack.id);
        setPendingModpackName(modpack.name);
        setPendingExistingMods(existingSlugs);
        setDepsDialogOpen(true);
      } else {
        await invoke('add_mod_to_modpack', {
          projectId: null,
          modpackId: selectedModpack,
          slug: result.mod_info.slug,
          title: result.mod_info.title,
          author: result.mod_info.author,
          iconUrl: result.mod_info.icon_url,
          versionId: result.mod_info.version_id,
          version: result.mod_info.version_number
        });

        toast({
          title: 'Mod added',
          description: `"${modName}" has been added to "${modpack.name}".`
        });

        setSelectedModpack(null);
        onOpenChange(false);
        onAdded?.();
      }
    } catch (error) {
      console.error('Failed to add mod:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: `Failed to add mod: ${error}`
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDepsDialogSuccess = () => {
    setSelectedModpack(null);
    setDepsDialogOpen(false);
    onOpenChange(false);
    onAdded?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Modpack</DialogTitle>
          <DialogDescription>Choose a modpack to add "{modName}" to.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : modpacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Package className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No modpacks yet</p>
            <p className="text-xs mt-1">Create a modpack first to add mods</p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {modpacks.map((modpack) => {
              const alreadyAdded = isModInModpack(modpack);
              return (
                <div
                  key={modpack.id}
                  onClick={() => !alreadyAdded && setSelectedModpack(modpack.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    alreadyAdded
                      ? 'border-border bg-muted/50 cursor-not-allowed opacity-60'
                      : selectedModpack === modpack.id
                        ? 'border-primary bg-primary/10 cursor-pointer'
                        : 'border-border bg-card hover:bg-card-hover cursor-pointer'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 via-card to-card flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-primary/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-foreground truncate">{modpack.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {modpack.game_version || modpack.minecraft_version} • {modpack.mods.length} mods • {modpack.loader ?? 'No loader'}
                    </p>
                  </div>
                  {alreadyAdded ? (
                    <span className="text-xs text-muted-foreground shrink-0">Already added</span>
                  ) : selectedModpack === modpack.id ? (
                    <Check className="w-5 h-5 text-primary shrink-0" />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="glow" onClick={handleAdd} disabled={!selectedModpack || isAdding}>
            {isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Add to Modpack
          </Button>
        </div>
      </DialogContent>
      {pendingModpackId && (
        <AddModWithDepsDialog
          open={depsDialogOpen}
          modInfo={pendingModInfo}
          modpackId={pendingModpackId}
          onOpenChange={setDepsDialogOpen}
          modpackName={pendingModpackName}
          dependencies={pendingDependencies}
          existingMods={pendingExistingMods}
          onSuccess={handleDepsDialogSuccess}
        />
      )}
    </Dialog>
  );
}
