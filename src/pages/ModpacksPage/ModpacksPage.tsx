import React from 'react';
import { useNavigate } from 'react-router-dom';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Grid3X3, Link, List, Loader2, Package, Plus, Search } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { useGame } from '~/usecase/contexts/GameContext';
import { ModpackCard } from '~/components/modpack/ModpackCard';
import { AppLayout } from '~/components/layout/AppLayout/AppLayout';
import { JoinModpackDialog } from '~/components/modpack/JoinModpackDialog';
import { CreateModpackDialog } from '~/components/modpack/CreateModpackDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

import { InstallProgress, InstallStatus, InstallStatusMap, Modpack, SyncStatus, SyncStatusMap } from './types';

export default function ModpacksPage() {
  const navigate = useNavigate();
  const { games } = useGame();
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = React.useState(false);
  const [modpacks, setModpacks] = React.useState<Modpack[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [syncStatuses, setSyncStatuses] = React.useState<SyncStatusMap>({});
  const [installStatuses, setInstallStatuses] = React.useState<InstallStatusMap>({});

  const loadModpacks = React.useCallback(async () => {
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
  }, []);

  React.useEffect(() => {
    loadModpacks();
  }, [loadModpacks]);

  React.useEffect(() => {
    const checkSyncStatuses = async () => {
      const joinedPacks = modpacks.filter((p) => !p.is_owner);
      if (joinedPacks.length === 0) return;

      const initialStatuses: SyncStatusMap = {};
      joinedPacks.forEach((pack) => {
        initialStatuses[pack.id] = { status: null, checking: true };
      });
      setSyncStatuses(initialStatuses);

      for (const pack of joinedPacks) {
        try {
          const status = await invoke<SyncStatus>('check_sync_status', {
            modpackId: pack.id
          });
          setSyncStatuses((prev) => ({
            ...prev,
            [pack.id]: { status, checking: false }
          }));
        } catch (err) {
          console.error(`Failed to check sync status for ${pack.id}:`, err);
          setSyncStatuses((prev) => ({
            ...prev,
            [pack.id]: { status: null, checking: false }
          }));
        }
      }
    };

    if (modpacks.length > 0) {
      checkSyncStatuses();
    }
  }, [modpacks]);

  React.useEffect(() => {
    const loadInstallStatuses = async () => {
      if (modpacks.length === 0) return;

      const statuses: InstallStatusMap = {};
      for (const pack of modpacks) {
        try {
          statuses[pack.id] = await invoke<InstallStatus>('get_install_status', {
            modpackId: pack.id
          });
        } catch (err) {
          console.error(`Failed to get install status for ${pack.id}:`, err);
        }
      }
      setInstallStatuses(statuses);
    };

    loadInstallStatuses();
  }, [modpacks]);

  React.useEffect(() => {
    const unlisten = listen<InstallProgress>('install-progress', (event) => {
      const progress = event.payload;

      setInstallStatuses((prev) => {
        const updated = { ...prev };
        for (const [id, status] of Object.entries(updated)) {
          if (status?.installing) {
            updated[id] = {
              ...status,
              progress,
              installing: progress.stage === 'complete' ? false : true,
              installed: progress.stage === 'complete' ? true : status.installed
            };
          }
        }
        return updated;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const installingPackIdsRef = React.useRef<string[]>([]);

  React.useEffect(() => {
    installingPackIdsRef.current = Object.entries(installStatuses)
      .filter(([_, s]) => s?.installing)
      .map(([id]) => id);
  }, [installStatuses]);

  const hasInstallingPacks = installingPackIdsRef.current.length > 0 ||
    Object.values(installStatuses).some((s) => s?.installing);

  React.useEffect(() => {
    if (!hasInstallingPacks) return;

    const interval = setInterval(async () => {
      const ids = installingPackIdsRef.current;
      if (ids.length === 0) return;

      for (const packId of ids) {
        try {
          const status = await invoke<InstallStatus>('get_install_status', { modpackId: packId });
          setInstallStatuses((prev) => ({ ...prev, [packId]: status }));
        } catch (err) {
          console.error(`Failed to poll install status for ${packId}:`, err);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [hasInstallingPacks]);

  const handleClone = React.useCallback(async (id: string) => {
    try {
      await invoke('clone_modpack', { id });
      toast({
        title: 'Modpack cloned',
        description: 'The modpack has been cloned to your library.'
      });
      loadModpacks();
    } catch (error) {
      console.error('Failed to clone modpack:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: `Failed to clone modpack: ${error}`
      });
    }
  }, [loadModpacks]);

  const handleDelete = React.useCallback(async (id: string) => {
    try {
      await invoke('delete_modpack', { id });
      toast({
        title: 'Modpack deleted',
        description: 'The modpack has been deleted successfully.'
      });
      loadModpacks();
    } catch (error) {
      console.error('Failed to delete modpack:', error);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: `Failed to delete modpack: ${error}`
      });
    }
  }, [loadModpacks]);

  const filteredPacks = React.useMemo(
    () => modpacks.filter((pack) => pack.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [modpacks, searchQuery]
  );

  const ownedPacks = React.useMemo(() => filteredPacks.filter((p) => p.is_owner), [filteredPacks]);
  const sharedPacks = React.useMemo(() => filteredPacks.filter((p) => !p.is_owner), [filteredPacks]);

  const gameInfoMap = React.useMemo(
    () => new Map(games.map((g) => [g.id, g])),
    [games]
  );

  const renderModpackGrid = (packs: Modpack[]) => {
    if (packs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mb-4 opacity-50" />
          <p>No modpacks found</p>
          <Button className="mt-4" variant="outline" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create your first modpack
          </Button>
        </div>
      );
    }

    return (
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
        {packs.map((pack) => {
          const syncStatusInfo = syncStatuses[pack.id];
          const installStatus = installStatuses[pack.id];
          const gameInfo = gameInfoMap.get(pack.game_id);
          return (
            <ModpackCard
              id={pack.id}
              key={pack.id}
              name={pack.name}
              gameId={pack.game_id}
              modSource={gameInfo?.mod_source}
              isOwner={pack.is_owner}
              loader={pack.loader}
              modCount={pack.mods.length}
              imagePath={pack.image_path}
              shareCode={pack.share_code}
              onEdit={loadModpacks}
              version={pack.game_version}
              onDelete={() => handleDelete(pack.id)}
              onClone={!pack.is_owner ? () => handleClone(pack.id) : undefined}
              installStatus={installStatus ?? undefined}
              onShareStatusChange={loadModpacks}
              syncInfo={
                !pack.is_owner && syncStatusInfo
                  ? {
                      checking: syncStatusInfo.checking,
                      is_synced: syncStatusInfo.status?.is_synced ?? false,
                      owner_online: syncStatusInfo.status?.owner_online ?? false
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Modpacks</h1>
            <p className="text-muted-foreground mt-1">
              {modpacks.length} modpacks {ownedPacks.length > 0 && `• ${ownedPacks.length} owned`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setJoinDialogOpen(true)}>
              <Link className="w-4 h-4" />
              Join Modpack
            </Button>
            <Button variant="glow" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              New Modpack
            </Button>
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="all">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="owned">Owned</TabsTrigger>
                <TabsTrigger value="shared">Shared with me</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-3">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    className="pl-10 bg-secondary"
                    placeholder="Search modpacks..."
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select defaultValue="recent">
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recently Updated</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="mods">Mod Count</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                  <Button
                    size="icon"
                    className="rounded-none"
                    onClick={() => setViewMode('grid')}
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    className="rounded-none"
                    onClick={() => setViewMode('list')}
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <TabsContent value="all" className="mt-6">
              {renderModpackGrid(filteredPacks)}
            </TabsContent>

            <TabsContent value="owned" className="mt-6">
              {renderModpackGrid(ownedPacks)}
            </TabsContent>

            <TabsContent value="shared" className="mt-6">
              {renderModpackGrid(sharedPacks)}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <CreateModpackDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(modpackId) => navigate(`/modpack/${modpackId}`)}
      />

      <JoinModpackDialog
        open={joinDialogOpen}
        onOpenChange={setJoinDialogOpen}
        onJoined={(modpackId) => navigate(`/modpack/${modpackId}`)}
      />
    </AppLayout>
  );
}
