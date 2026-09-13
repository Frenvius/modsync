import type { InstanceTabProps } from '~/components/Instance/types';

import { Badge } from '~/components/ui/badge';
import { LOADER_NAMES } from '~/domain/data/catalog';
import { projectService } from '~/usecase/service/project';

const VersionsTab = ({ instance }: InstanceTabProps) => {
  const game = projectService.getGame(instance.gameId);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Game version</h2>
        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-mono">{instance.gameVersion}</span>
          <Badge className="bg-primary/10 text-primary">Installed</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {game.name} runtime files are verified and prepared when this instance launches.
        </p>
      </div>
      <aside className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Loader</h3>
        <span className="text-sm">
          {LOADER_NAMES[instance.loader]} <span className="font-mono text-muted-foreground">{instance.loaderVersion}</span>
        </span>
      </aside>
    </div>
  );
};

export default VersionsTab;
