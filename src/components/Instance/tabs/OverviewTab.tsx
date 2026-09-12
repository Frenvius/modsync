import type { Instance, InstalledMod } from '~/domain/interfaces/instance.interface';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Boxes, ArrowUp, Compass, Package, HardDrive, ShieldAlert, ShieldCheck, CalendarDays } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import { PROJECTS } from '~/usecase/mock/projects';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { UpdateStatus } from '~/domain/enums/provider.enum';
import { UpdateBadge } from '~/components/commons/Badges';
import { formatDate, formatRelative, formatPlaytime } from '~/usecase/util/formatUtils';

interface OverviewTabProps {
  instance: Instance;
}

const majorMinor = (v: string) => v.split(/[.+-]/).slice(0, 2).join('.');

const isRisky = (mod: InstalledMod, instance: Instance) => {
  const project = PROJECTS.find((p) => p.id === mod.projectId);
  const supportsVersion = project?.gameVersions.includes(instance.gameVersion) ?? true;
  return !supportsVersion || majorMinor(mod.installedVersion) !== majorMinor(mod.latestCompatibleVersion);
};

const OverviewTab = ({ instance }: OverviewTabProps) => {
  const navigate = useNavigate();
  const modpack = useAppStore((s) => s.modpacks.find((m) => m.id === instance.modpack?.modpackId));
  const updateMods = useAppStore((s) => s.updateMods);
  const updates = instance.mods.filter((m) => m.status === UpdateStatus.UpdateAvailable);
  const safe = updates.filter((m) => !isRisky(m, instance));
  const risky = updates.filter((m) => isRisky(m, instance));
  const problems = instance.mods.filter((m) => m.status === UpdateStatus.Incompatible || m.status === UpdateStatus.DependencyMissing);

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
              {problems.map((m) => (
                <div key={m.projectId} className="flex items-center gap-3 border-b border-destructive/20 px-3 py-2 text-sm last:border-b-0">
                  <ProjectIcon size="sm" name={m.name} color={m.iconColor} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.status === UpdateStatus.DependencyMissing ? `Requires ${m.missingDependency}, which is not installed.` : 'Not compatible with this loader or game version.'}
                    </span>
                  </span>
                  <UpdateBadge status={m.status} />
                  {m.status === UpdateStatus.DependencyMissing ? (
                    <Button size="xs" variant="secondary" onClick={() => navigate(`/discover?instance=${instance.id}`)}>
                      Install {m.missingDependency}
                    </Button>
                  ) : (
                    <Button size="xs" variant="secondary" onClick={() => navigate(`/instance/${instance.id}?tab=mod`)}>
                      Review
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" />
              Safe updates ({safe.length})
            </h2>
            <Button size="sm" variant="secondary" disabled={safe.length === 0} onClick={() => updateMods(instance.id, safe.map((m) => m.projectId))}>
              <ArrowUp data-icon="inline-start" />
              Update all safe
            </Button>
          </div>
          <UpdateList mods={safe} instanceId={instance.id} empty="Nothing to update." />
        </section>

        {risky.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="size-4 text-warning" />
              Potentially breaking ({risky.length})
            </h2>
            <p className="text-xs text-muted-foreground">Major version jumps or releases not tested against {instance.gameVersion}. Review the changelog before updating.</p>
            <UpdateList mods={risky} instanceId={instance.id} empty="" risky />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Description</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{instance.description}</p>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Stats</h3>
          <dl className="flex flex-col gap-2 text-sm">
            <Stat icon={Clock} label="Playtime" value={formatPlaytime(instance.playtimeMinutes)} />
            <Stat icon={CalendarDays} label="Last played" value={formatRelative(instance.lastPlayed)} />
            <Stat icon={Package} label="Mods" value={`${instance.mods.filter((m) => m.enabled).length} enabled / ${instance.mods.length}`} />
            <Stat icon={HardDrive} label="Created" value={formatDate(instance.createdAt)} />
          </dl>
        </div>
        {modpack && (
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Boxes className="size-4" />
              Modpack
            </h3>
            <span className="text-sm">{modpack.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              Installed v{instance.modpack?.version}
              {modpack.version !== instance.modpack?.version && <Badge className="bg-info/15 text-info">v{modpack.version} available</Badge>}
            </span>
            <Button size="sm" variant="outline" onClick={() => navigate(`/modpack/${modpack.id}`)}>
              Open modpack
            </Button>
          </div>
        )}
        <Button variant="outline" onClick={() => navigate(`/discover?instance=${instance.id}`)}>
          <Compass data-icon="inline-start" />
          Discover mods for this instance
        </Button>
      </aside>
    </div>
  );
};

interface StatProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}

const Stat = ({ icon: Icon, label, value }: StatProps) => (
  <div className="flex items-center gap-2">
    <Icon className="size-4 text-muted-foreground" />
    <dt className="flex-1 text-muted-foreground">{label}</dt>
    <dd className="font-medium tabular-nums">{value}</dd>
  </div>
);

interface UpdateListProps {
  empty: string;
  risky?: boolean;
  instanceId: string;
  mods: Array<InstalledMod>;
}

const UpdateList = ({ mods, empty, risky, instanceId }: UpdateListProps) => {
  const updateMods = useAppStore((s) => s.updateMods);
  if (mods.length === 0) return empty ? <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <div className={risky ? 'rounded-lg border border-warning/30 bg-warning/5' : 'rounded-lg border bg-card'}>
      {mods.map((m) => (
        <div key={m.projectId} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
          <ProjectIcon size="sm" name={m.name} color={m.iconColor} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{m.name}</span>
            <span className="truncate text-xs text-muted-foreground">Fixed a crash when loading worlds created on older versions. Improved compatibility.</span>
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {m.installedVersion} <span className="mx-1">to</span> <span className={risky ? 'text-warning' : 'text-info'}>{m.latestCompatibleVersion}</span>
          </span>
          <Button size="xs" variant={risky ? 'outline' : 'secondary'} onClick={() => updateMods(instanceId, [m.projectId])}>
            <ArrowUp data-icon="inline-start" />
            Update
          </Button>
        </div>
      ))}
    </div>
  );
};

export default OverviewTab;
