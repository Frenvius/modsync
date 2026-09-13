import type { StatProps, InstanceTabProps } from '~/components/Instance/types';

import { useNavigate } from 'react-router-dom';

import { Clock, Compass, Package, HardDrive, ShieldAlert, CalendarDays } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { UpdateBadge } from '~/components/commons/Badges';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { UpdateStatus } from '~/domain/enums/provider.enum';
import { formatDate, formatRelative, formatPlaytime } from '~/usecase/util/formatUtils';

const OverviewTab = ({ instance }: InstanceTabProps) => {
  const navigate = useNavigate();
  const problems = instance.mods.filter(
    (mod) =>
      mod.status === UpdateStatus.Incompatible ||
      mod.status === UpdateStatus.DependencyMissing ||
      mod.status === UpdateStatus.Damaged
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-6">
        {problems.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="size-4 text-destructive" />
              Needs attention
            </h2>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5">
              {problems.map((mod) => (
                <div
                  key={mod.projectId}
                  className="flex items-center gap-3 border-b border-destructive/20 px-3 py-2 text-sm last:border-b-0"
                >
                  <ProjectIcon size="sm" name={mod.name} color={mod.iconColor} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{mod.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {mod.status === UpdateStatus.DependencyMissing
                        ? `Requires ${mod.missingDependency}, which is not installed.`
                        : mod.status === UpdateStatus.Damaged
                          ? 'One or more tracked files are missing or modified.'
                          : 'Not compatible with this loader or game version.'}
                    </span>
                  </span>
                  <UpdateBadge status={mod.status} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Description</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{instance.description}</p>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Stats</h3>
          <dl className="flex flex-col gap-2 text-sm">
            <Stat icon={Clock} label="Playtime" value={formatPlaytime(instance.playtimeMinutes)} />
            <Stat icon={CalendarDays} label="Last played" value={formatRelative(instance.lastPlayed)} />
            <Stat
              label="Mods"
              icon={Package}
              value={`${instance.mods.filter((mod) => mod.enabled).length} enabled / ${instance.mods.length}`}
            />
            <Stat label="Created" icon={HardDrive} value={formatDate(instance.createdAt)} />
          </dl>
        </div>
        <Button variant="outline" onClick={() => navigate(`/discover?instance=${instance.id}`)}>
          <Compass data-icon="inline-start" />
          Discover mods for this instance
        </Button>
      </aside>
    </div>
  );
};

const Stat = ({ label, value, icon: Icon }: StatProps) => (
  <div className="flex items-center gap-2">
    <Icon className="size-4 text-muted-foreground" />
    <dt className="flex-1 text-muted-foreground">{label}</dt>
    <dd className="font-medium tabular-nums">{value}</dd>
  </div>
);

export default OverviewTab;
