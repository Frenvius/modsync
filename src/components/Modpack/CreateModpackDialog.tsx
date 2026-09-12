import type { CreateModpackDialogProps } from './types';
import type { GameId, LoaderId } from '~/domain/enums/provider.enum';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { GAMES } from '~/usecase/mock/games';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import GameIcon from '~/components/commons/GameIcon';
import { useAppStore } from '~/usecase/store/appStore';
import { projectService } from '~/usecase/service/project';
import InstanceIcon from '~/components/commons/InstanceIcon';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '~/components/ui/tabs';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';
import { Dialog, DialogTitle, DialogFooter, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

const CreateModpackDialog = ({ open, onOpenChange }: CreateModpackDialogProps) => {
  const navigate = useNavigate();
  const instances = useAppStore((s) => s.instances);
  const createEmpty = useAppStore((s) => s.createEmptyModpack);
  const createFromInstance = useAppStore((s) => s.createModpackFromInstance);
  const [busy, setBusy] = React.useState(false);
  const [instanceId, setInstanceId] = React.useState<string | undefined>(instances[0]?.id);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [gameId, setGameId] = React.useState<GameId>(GAMES[0].id);
  const game = projectService.getGame(gameId);
  const [gameVersion, setGameVersion] = React.useState(game.versions[0]);
  const [loader, setLoader] = React.useState<LoaderId>(game.loaders[0].id);

  const changeGame = (id: GameId) => {
    const g = projectService.getGame(id);
    setGameId(id);
    setGameVersion(g.versions[0]);
    setLoader(g.loaders.find((l) => l.recommended)?.id ?? g.loaders[0].id);
  };

  const finish = (id: string) => {
    setBusy(false);
    onOpenChange(false);
    toast.success('Modpack created');
    navigate(`/modpack/${id}`);
  };

  const submitFromInstance = async () => {
    if (!instanceId) return;
    setBusy(true);
    const pack = await createFromInstance(instanceId);
    finish(pack.id);
  };

  const submitEmpty = async () => {
    if (name.trim().length < 2) return;
    setBusy(true);
    const pack = await createEmpty({ gameId, loader, gameVersion, description, name: name.trim() });
    finish(pack.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New modpack</DialogTitle>
          <DialogDescription>Snapshot an instance or start from scratch.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="instance">
          <TabsList className="w-full">
            <TabsTrigger value="instance" className="flex-1">
              From instance
            </TabsTrigger>
            <TabsTrigger value="empty" className="flex-1">
              Empty
            </TabsTrigger>
          </TabsList>
          <TabsContent value="instance" className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
              <Label>Instance</Label>
              <Select value={instanceId} onValueChange={setInstanceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick an instance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {instances.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        <InstanceIcon size="sm" icon={i.icon} color={i.iconColor} className="size-5 rounded-sm [&>svg]:size-3" />
                        {i.name}
                        <span className="text-xs text-muted-foreground">{i.mods.length} mods</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={submitFromInstance} disabled={!instanceId || busy}>
                {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Create modpack
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="empty" className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pack-name">Name</Label>
              <Input value={name} id="pack-name" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-2">
                <Label>Game</Label>
                <Select value={gameId} onValueChange={(v) => changeGame(v as GameId)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {GAMES.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          <GameIcon size="sm" gameId={g.id} />
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Version</Label>
                <Select value={gameVersion} onValueChange={setGameVersion}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {game.versions.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Loader</Label>
                <Select value={loader} onValueChange={(v) => setLoader(v as LoaderId)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {game.loaders.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pack-desc">Description</Label>
              <Textarea rows={3} id="pack-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <DialogFooter>
              <Button onClick={submitEmpty} disabled={name.trim().length < 2 || busy}>
                {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Create modpack
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CreateModpackDialog;
