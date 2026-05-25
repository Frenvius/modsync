import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/usecase/hooks/use-toast';
import { useGame } from '~/usecase/contexts/GameContext';
import { LOADERS } from '~/components/modpack/CreateModpackDialog/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { EditModpackDialogProps, GameVersion } from './types';

export function EditModpackDialog({
  open,
  onSave,
  modpackId,
  modpackName,
  modpackLoader,
  onOpenChange,
  modpackVersion,
  modpackImagePath
}: EditModpackDialogProps) {
  const { selectedGame } = useGame();
  const [name, setName] = React.useState(modpackName);
  const [version, setVersion] = React.useState(modpackVersion);
  const [loader, setLoader] = React.useState(modpackLoader);
  const [versions, setVersions] = React.useState<GameVersion[]>([]);
  const [includeSnapshots, setIncludeSnapshots] = React.useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [imagePreview, setImagePreview] = React.useState<null | string>(null);
  const [imageData, setImageData] = React.useState<null | string>(null);
  const [imageRemoved, setImageRemoved] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isMinecraft = selectedGame?.id === 'minecraft';

  const displayVersions = React.useMemo(() => {
    if (!version || versions.some((v) => v.version === version)) return versions;
    return [{ version, version_type: 'release' }, ...versions];
  }, [version, versions]);

  React.useEffect(() => {
    const loadVersions = async () => {
      if (!selectedGame?.requires_loader) return;

      setIsLoadingVersions(true);
      try {
        const gameVersions = await invoke<GameVersion[]>('get_game_versions', {
          gameId: selectedGame?.id ?? 'minecraft',
          includeSnapshots: isMinecraft && includeSnapshots
        });
        setVersions(gameVersions);
      } catch (error) {
        console.error('Failed to load game versions:', error);
      } finally {
        setIsLoadingVersions(false);
      }
    };

    if (open) {
      loadVersions();
    }
  }, [open, selectedGame, includeSnapshots, isMinecraft]);

  React.useEffect(() => {
    const loadExistingImage = async () => {
      if (modpackImagePath) {
        try {
          const dataUrl = await invoke<string>('get_image_data', {
            relativePath: modpackImagePath
          });
          setImagePreview(dataUrl);
        } catch (err) {
          console.error('Failed to load image:', err);
          setImagePreview(null);
        }
      } else {
        setImagePreview(null);
      }
    };

    if (open) {
      setName(modpackName);
      setVersion(modpackVersion);
      setLoader(modpackLoader);
      setImageData(null);
      setImageRemoved(false);
      const looksLikeRelease = /^\d+\.\d+(\.\d+)?$/.test(modpackVersion);
      setIncludeSnapshots(!looksLikeRelease && modpackVersion.length > 0);
      loadExistingImage();
    }
  }, [open, modpackName, modpackVersion, modpackImagePath]);

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
    setImageRemoved(false);

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
    setImageRemoved(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Please enter a modpack name'
      });
      return;
    }

    if (modpackId) {
      setIsSaving(true);
      try {
        await invoke('update_modpack', {
          id: modpackId,
          name: name.trim(),
          gameVersion: version,
          loader
        });

        if (imageData) {
          await invoke('set_modpack_image', {
            modpackId,
            imageData
          });
        } else if (imageRemoved && modpackImagePath) {
          await invoke('remove_modpack_image', {
            modpackId
          });
        }

        toast({
          title: 'Modpack updated',
          description: `"${name}" has been updated successfully.`
        });
        onOpenChange(false);
        onSave?.();
      } catch (error) {
        console.error('Failed to update modpack:', error);
        toast({
          title: 'Error',
          variant: 'destructive',
          description: `Failed to update modpack: ${error}`
        });
      } finally {
        setIsSaving(false);
      }
    } else {
      toast({
        title: 'Modpack updated',
        description: `"${name}" has been updated successfully.`
      });
      onOpenChange(false);
      onSave?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Modpack</DialogTitle>
          <DialogDescription>Update your modpack details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} disabled={isSaving} placeholder="Modpack name" onChange={(e) => setName(e.target.value)} />
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
                      disabled={isSaving}
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
              <input type="file" accept="image/*" ref={fileInputRef} className="hidden" disabled={isSaving} onChange={handleImageSelect} />
            </div>
          </div>

          {selectedGame?.requires_loader && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="version">Game Version</Label>
                  {isMinecraft && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="snapshots" className="text-xs text-muted-foreground font-normal">
                        Show snapshots
                      </Label>
                      <Switch
                        id="snapshots"
                        checked={includeSnapshots}
                        disabled={isSaving || isLoadingVersions}
                        onCheckedChange={setIncludeSnapshots}
                      />
                    </div>
                  )}
                </div>
                <Select value={version} disabled={isSaving} onValueChange={setVersion}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingVersions ? 'Loading...' : 'Select version'} />
                  </SelectTrigger>
                  <SelectContent>
                    {displayVersions.map((v) => (
                      <SelectItem key={v.version} value={v.version}>
                        {v.version}
                        {v.version_type && v.version_type !== 'release' ? ` (${v.version_type})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isMinecraft && (
                <div className="space-y-2">
                  <Label htmlFor="loader">Mod Loader</Label>
                  <Select value={loader} disabled={isSaving} onValueChange={setLoader}>
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
              )}
            </>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="glow" disabled={isSaving} onClick={handleSave}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
