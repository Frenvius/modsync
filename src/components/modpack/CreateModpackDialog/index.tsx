import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/usecase/hooks/use-toast';
import { Textarea } from '~/components/ui/textarea';
import { useGame } from '~/usecase/contexts/GameContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { LOADERS } from './constants';
import { CreateModpackDialogProps, GameVersion, LoaderVersionInfo, Modpack } from './types';

export function CreateModpackDialog({ open, onCreated, onOpenChange }: CreateModpackDialogProps) {
  const { selectedGame } = useGame();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [gameVersion, setGameVersion] = React.useState('');
  const [loader, setLoader] = React.useState('');
  const [loaderVersion, setLoaderVersion] = React.useState('');
  const [loaderVersions, setLoaderVersions] = React.useState<LoaderVersionInfo[]>([]);
  const [isLoadingLoaderVersions, setIsLoadingLoaderVersions] = React.useState(false);
  const [versions, setVersions] = React.useState<GameVersion[]>([]);
  const [includeSnapshots, setIncludeSnapshots] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [imagePreview, setImagePreview] = React.useState<null | string>(null);
  const [imageData, setImageData] = React.useState<null | string>(null);
  const [vsDataPath, setVsDataPath] = React.useState('');
  const [vsDetecting, setVsDetecting] = React.useState(false);
  const [vsModCount, setVsModCount] = React.useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isVintageStory = selectedGame?.mod_source === 'vintagestory';

  React.useEffect(() => {
    if (!open || !isVintageStory) return;
    setVsDetecting(true);
    invoke<string | null>('detect_vs_data_path')
      .then(async (path) => {
        if (path) {
          setVsDataPath(path);
          const [mods, detectedVersion] = await Promise.all([
            invoke<{ modid: string }[]>('scan_vs_mods', { dataPath: path }),
            invoke<string | null>('detect_vs_game_version', { dataPath: path })
          ]);
          setVsModCount(mods.length);
          if (detectedVersion) {
            setGameVersion(detectedVersion);
          }
        }
      })
      .catch(() => {})
      .finally(() => setVsDetecting(false));
  }, [open, isVintageStory]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        variant: 'destructive',
        description: 'Please select an image file'
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setImageData(base64);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  React.useEffect(() => {
    if (open) {
      loadVersions();
    }
  }, [open, selectedGame, includeSnapshots]);

  const isMinecraft = selectedGame?.id === 'minecraft';

  React.useEffect(() => {
    if (!loader || !isMinecraft) {
      setLoaderVersions([]);
      setLoaderVersion('');
      return;
    }

    const needsGameVersion = loader === 'neoforge' || loader === 'forge';
    if (needsGameVersion && !gameVersion) {
      setLoaderVersions([]);
      setLoaderVersion('');
      return;
    }

    let cancelled = false;
    const fetchLoaderVersions = async () => {
      setIsLoadingLoaderVersions(true);
      try {
        const versions = await invoke<LoaderVersionInfo[]>('get_loader_versions', {
          loader,
          gameVersion: gameVersion || null
        });
        if (!cancelled) {
          setLoaderVersions(versions);
          setLoaderVersion('');
        }
      } catch (err) {
        console.error('Failed to load loader versions:', err);
        if (!cancelled) setLoaderVersions([]);
      } finally {
        if (!cancelled) setIsLoadingLoaderVersions(false);
      }
    };

    fetchLoaderVersions();
    return () => { cancelled = true; };
  }, [loader, gameVersion, isMinecraft]);

  const hasGameVersions = selectedGame?.requires_loader || selectedGame?.mod_source === 'vintagestory';

  const loadVersions = async () => {
    if (!hasGameVersions) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const gameVersions = await invoke<GameVersion[]>('get_game_versions', {
        gameId: selectedGame.id,
        includeSnapshots: isMinecraft && includeSnapshots
      });
      setVersions(gameVersions);
    } catch (error) {
      console.error('Failed to load game versions:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: 'Failed to load game versions'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Please enter a modpack name'
      });
      return;
    }

    const requiresLoader = selectedGame?.requires_loader ?? true;
    const needsGameVersion = requiresLoader || selectedGame?.mod_source === 'vintagestory';

    if (needsGameVersion && !gameVersion) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Please select a game version'
      });
      return;
    }

    if (requiresLoader && !loader) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Please select a mod loader'
      });
      return;
    }

    if (isVintageStory && !vsDataPath) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Vintage Story data path not detected. Please check your installation.'
      });
      return;
    }

    setIsCreating(true);
    try {
      const modpack = await invoke<Modpack>('create_modpack', {
        gameId: selectedGame?.id ?? 'minecraft',
        gameVersion: needsGameVersion ? gameVersion : selectedGame?.default_version ?? 'latest',
        loader: requiresLoader ? loader : null,
        loaderVersion: (requiresLoader && loaderVersion) ? loaderVersion : null,
        name: name.trim(),
        description: description.trim() || null,
        dataPath: isVintageStory ? vsDataPath : null
      });

      if (isVintageStory && vsDataPath) {
        try {
          await invoke('import_vs_installation', {
            modpackId: modpack.id,
            dataPath: vsDataPath
          });
        } catch (err) {
          console.error('Failed to import VS mods:', err);
          toast({
            variant: 'destructive',
            title: 'Import failed',
            description: String(err)
          });
        }
      }

      if (imageData) {
        try {
          await invoke('set_modpack_image', {
            imageData,
            modpackId: modpack.id
          });
        } catch (err) {
          console.error('Failed to save image:', err);
        }
      }

      setName('');
      setDescription('');
      setGameVersion('');
      setLoader('');
      setLoaderVersion('');
      setImagePreview(null);
      setImageData(null);
      setVsDataPath('');
      setVsModCount(null);

      onOpenChange(false);
      onCreated?.(modpack.id);
    } catch (error) {
      console.error('Failed to create modpack:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: `Failed to create modpack: ${error}`
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isCreating) return;

    if (!newOpen) {
      setName('');
      setDescription('');
      setGameVersion('');
      setLoader('');
      setLoaderVersion('');
      setImagePreview(null);
      setImageData(null);
      setIncludeSnapshots(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>Create New Modpack</DialogTitle>
          <DialogDescription>Set up a new modpack to start adding mods.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                disabled={isCreating}
                placeholder="My Awesome Modpack"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Image</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-md border-2 border-dashed border-border hover:border-primary/50 transition-colors flex items-center justify-center overflow-hidden cursor-pointer bg-muted/50 relative group"
              >
                {imagePreview ? (
                  <>
                    <img alt="Preview" src={imagePreview} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      disabled={isCreating}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage();
                      }}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </>
                ) : (
                  <ImagePlus className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                disabled={isCreating}
                onChange={handleImageSelect}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              rows={3}
              id="description"
              value={description}
              disabled={isCreating}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of your modpack..."
            />
          </div>

          {isVintageStory && (
            <div className="space-y-2">
              <Label>Installation Path</Label>
              {vsDetecting ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Detecting Vintage Story installation...
                </div>
              ) : vsDataPath ? (
                <div className="space-y-1">
                  <Input
                    readOnly
                    value={vsDataPath}
                    className="font-mono text-sm text-muted-foreground bg-secondary cursor-default"
                  />
                  {vsModCount !== null && vsModCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {vsModCount} mod{vsModCount > 1 ? 's' : ''} detected — will be imported automatically
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-destructive">
                  Vintage Story data directory not found. Make sure the game is installed.
                </p>
              )}
            </div>
          )}

          {hasGameVersions && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="version">Game Version *</Label>
                {isMinecraft && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="snapshots" className="text-xs text-muted-foreground font-normal">
                      Show snapshots
                    </Label>
                    <Switch
                      id="snapshots"
                      checked={includeSnapshots}
                      disabled={isCreating || isLoading}
                      onCheckedChange={(checked) => {
                        setIncludeSnapshots(checked);
                        setGameVersion('');
                      }}
                    />
                  </div>
                )}
              </div>
              <Select disabled={isCreating} value={gameVersion} onValueChange={setGameVersion}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? 'Loading...' : 'Select version'} />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.version} value={v.version}>
                      {v.version}
                      {v.version_type && v.version_type !== 'release' ? ` (${v.version_type})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedGame?.requires_loader && (
            <>
              <div className="space-y-2">
                <Label htmlFor="loader">Mod Loader *</Label>
                <Select value={loader} disabled={isCreating} onValueChange={setLoader}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select loader" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOADERS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loader && isMinecraft && (
                <div className="space-y-2">
                  <Label htmlFor="loaderVersion">Loader Version</Label>
                  <Select
                    value={loaderVersion}
                    disabled={isCreating || isLoadingLoaderVersions || loaderVersions.length === 0}
                    onValueChange={setLoaderVersion}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingLoaderVersions ? 'Loading...' : 'Latest (recommended)'} />
                    </SelectTrigger>
                    <SelectContent>
                      {loaderVersions.slice(0, 50).map((v) => (
                        <SelectItem key={v.version} value={v.version}>
                          {v.version}{v.stable ? '' : ' (unstable)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" disabled={isCreating} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="glow" disabled={isCreating} onClick={handleCreate}>
            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Modpack
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
