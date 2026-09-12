import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import { Play, Loader2, Package, Settings2 } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { usePlay } from '~/usecase/hooks/usePlay';
import { LOADER_NAMES } from '~/usecase/mock/games';
import GameIcon from '~/components/commons/GameIcon';
import { useInstance } from '~/usecase/store/appStore';
import LogsTab from '~/components/Instance/tabs/LogsTab';
import ModsTab from '~/components/Instance/tabs/ModsTab';
import EmptyState from '~/components/commons/EmptyState';
import { projectService } from '~/usecase/service/project';
import InstanceIcon from '~/components/commons/InstanceIcon';
import ConfigTab from '~/components/Instance/tabs/ConfigTab';
import InstanceMenu from '~/components/Instance/InstanceMenu';
import OverviewTab from '~/components/Instance/tabs/OverviewTab';
import VersionsTab from '~/components/Instance/tabs/VersionsTab';
import SettingsTab from '~/components/Instance/tabs/SettingsTab';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '~/components/ui/tabs';

import { CONTENT_TAB_LABELS } from './constants';

const InstancePage = () => {
  const { instanceId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const instance = useInstance(instanceId);
  const { play, playing } = usePlay(instanceId ?? '');
  const tab = params.get('tab') ?? 'overview';

  if (!instance) {
    return (
      <div className="p-4">
        <EmptyState icon={Package} title="Instance not found">
          <Button variant="outline" onClick={() => navigate('/library')}>
            Back to Library
          </Button>
        </EmptyState>
      </div>
    );
  }

  const game = projectService.getGame(instance.gameId);
  const contentTypes = game.contentTypes;

  return (
    <div className="flex flex-col">
      <header
        className="flex items-center gap-4 border-b border-border/50 bg-secondary/30 px-4 py-3"
        style={{
          background: `linear-gradient(110deg, color-mix(in oklch, ${instance.iconColor} 16%, var(--background)) 0%, var(--background) 55%)`
        }}
      >
        <InstanceIcon size="xl" icon={instance.icon} color={instance.iconColor} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{instance.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <GameIcon size="sm" gameId={instance.gameId} className="size-3.5 rounded-[3px] [&>svg]:size-2.5" />
              {game.name}
            </Badge>
            <Badge variant="secondary" className="font-mono">
              {instance.gameVersion}
            </Badge>
            <Badge variant="secondary">
              {LOADER_NAMES[instance.loader]} {instance.loaderVersion}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {instance.mods.length} mods
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="lg" className="px-6" disabled={playing} onClick={() => play()}>
            {playing ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Play data-icon="inline-start" className="fill-current" />
            )}
            Play
          </Button>
          <Button size="icon-lg" variant="outline" aria-label="Instance settings" onClick={() => setParams({ tab: 'settings' })}>
            <Settings2 />
          </Button>
          <InstanceMenu size="icon" variant="outline" instance={instance} />
        </div>
      </header>

      <Tabs value={tab} className="gap-0" onValueChange={(v) => setParams(v === 'overview' ? {} : { tab: v })}>
        <TabsList variant="line" className="h-9 w-full justify-start rounded-none border-b border-border/50 px-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {contentTypes.map((t) => (
            <TabsTrigger key={t} value={t}>
              {CONTENT_TAB_LABELS[t]}
            </TabsTrigger>
          ))}
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <div className="p-4">
          <TabsContent value="overview">
            <OverviewTab instance={instance} />
          </TabsContent>
          {contentTypes.map((t) => (
            <TabsContent key={t} value={t}>
              <ModsTab contentType={t} instance={instance} />
            </TabsContent>
          ))}
          <TabsContent value="versions">
            <VersionsTab instance={instance} />
          </TabsContent>
          <TabsContent value="config">
            <ConfigTab instance={instance} />
          </TabsContent>
          <TabsContent value="logs">
            <LogsTab instance={instance} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab instance={instance} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default InstancePage;
