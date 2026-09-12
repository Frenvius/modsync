import type { InstanceTabProps } from '~/components/Instance/types';

import React from 'react';

import { toast } from 'sonner';
import { Check, TriangleAlert } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { PROJECTS } from '~/usecase/mock/projects';
import { LOADER_NAMES } from '~/usecase/mock/games';
import { projectService } from '~/usecase/service/project';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';

const VersionsTab = ({ instance }: InstanceTabProps) => {
  const game = projectService.getGame(instance.gameId);
  const [picked, setPicked] = React.useState(instance.gameVersion);
  const unsupported = instance.mods.filter((m) => {
    const project = PROJECTS.find((p) => p.id === m.projectId);
    return project ? !project.gameVersions.includes(picked) : false;
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Game version</h2>
        <ul className="flex flex-col gap-1">
          {game.versions.map((v, i) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => setPicked(v)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  picked === v && 'border-primary/40 bg-primary/5'
                )}
              >
                <span className="font-mono">{v}</span>
                {i === 0 && <Badge variant="secondary">Latest</Badge>}
                {v === instance.gameVersion && <Badge className="bg-primary/10 text-primary">Installed</Badge>}
                <span className="flex-1" />
                {picked === v && <Check className="size-4 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <aside className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Loader</h3>
          <span className="text-sm">
            {LOADER_NAMES[instance.loader]} <span className="font-mono text-muted-foreground">{instance.loaderVersion}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => toast.info('Loader is already on the latest build')}>
            Check for loader updates
          </Button>
        </div>
        {picked !== instance.gameVersion && (
          <div className="flex flex-col gap-3">
            {unsupported.length > 0 ? (
              <Alert className="border-warning/40 text-warning">
                <TriangleAlert />
                <AlertTitle>
                  {unsupported.length} mods have no release for {picked}
                </AlertTitle>
                <AlertDescription>
                  {unsupported.map((m) => m.name).join(', ')}. They will be disabled after switching.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <Check />
                <AlertTitle>All mods support {picked}</AlertTitle>
              </Alert>
            )}
            <Button onClick={() => toast.success(`Switching to ${picked} queued in Downloads`)}>Switch to {picked}</Button>
          </div>
        )}
      </aside>
    </div>
  );
};

export default VersionsTab;
