import React from 'react';

import { invoke } from '@tauri-apps/api/core';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';

interface GamePathDialogProps {
  open: boolean;
  gameId: string;
  gameName: string;
  onOpenChange: (open: boolean) => void;
}

export function GamePathDialog({ open, gameId, gameName, onOpenChange }: GamePathDialogProps) {
  const [path, setPath] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      invoke<string | null>('get_game_path', { gameId })
        .then((p) => setPath(p ?? ''))
        .catch(() => setPath(''));
    }
  }, [open, gameId]);

  const handleDetect = async () => {
    try {
      const detected = await invoke<string>('detect_game_path', { gameId });
      setPath(detected);
      toast({ title: 'Game path detected', description: detected });
    } catch (err) {
      toast({
        title: 'Auto-detect failed',
        variant: 'destructive',
        description: String(err)
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke('set_game_path', { gameId, path });
      toast({ title: 'Game path saved' });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Failed to save', variant: 'destructive', description: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await invoke('set_game_path', { gameId, path: '' });
      setPath('');
      toast({ title: 'Custom path cleared', description: 'Steam auto-detect will be used.' });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Failed to clear', variant: 'destructive', description: String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set {gameName} Game Path</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            By default, the game is launched via Steam. Set a custom path to launch the executable directly (e.g. a non-Steam copy).
          </p>
          <div className="space-y-2">
            <Label>Game Installation Folder</Label>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="e.g. C:\Program Files (x86)\Steam\steamapps\common\Valheim"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleDetect}>
            Auto-detect via Steam
          </Button>
        </div>
        <DialogFooter>
          {path && (
            <Button variant="ghost" onClick={handleClear} disabled={isSaving}>
              Clear
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !path}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
