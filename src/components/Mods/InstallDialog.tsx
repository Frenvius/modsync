import type { InstallDialogProps } from './types';

import React from 'react';

import { toast } from 'sonner';
import { Ban, Loader2, Download, TriangleAlert } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { useAppStore } from '~/usecase/store/appStore';
import { projectService } from '~/usecase/service/project';
import ProjectIcon from '~/components/commons/ProjectIcon';
import InstanceIcon from '~/components/commons/InstanceIcon';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import { contentService, type InstallPlanItem } from '~/usecase/service/content';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';
import { Dialog, DialogTitle, DialogFooter, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

const InstallDialog = ({ open, project, version, instanceId, onOpenChange }: InstallDialogProps) => {
  const instances = useAppStore((s) => s.instances);
  const installMod = useAppStore((s) => s.installMod);
  const [busy, setBusy] = React.useState(false);
  const [target, setTarget] = React.useState<string | undefined>(instanceId);
  const [plan, setPlan] = React.useState<Array<InstallPlanItem>>([]);
  const [planError, setPlanError] = React.useState<string>();
  const [planLoading, setPlanLoading] = React.useState(false);
  const [optionalPicked, setOptionalPicked] = React.useState<Array<string>>([]);

  const candidates = instances.filter((i) => i.gameId === project?.gameId);
  const instance = candidates.find((i) => i.id === target) ?? candidates[0];

  React.useEffect(() => {
    if (open) {
      setTarget(instanceId ?? candidates[0]?.id);
      setOptionalPicked([]);
    }
  }, [open, instanceId, project?.id]);

  React.useEffect(() => {
    if (!open || !project || !instance) {
      setPlan([]);
      return;
    }
    let cancelled = false;
    setPlan([]);
    setPlanLoading(true);
    setPlanError(undefined);
    void contentService
      .preview({
        versionId: version,
        projectId: project.id,
        instanceId: instance.id,
        optionalDependencies: optionalPicked
      })
      .then((items) => {
        if (!cancelled) setPlan(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) setPlanError(getErrorMessage(error, 'Could not resolve the installation plan'));
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instance, open, optionalPicked, project, version]);

  if (!project) return null;

  const report = instance ? projectService.checkCompatibility(project, instance) : { issues: [], compatible: false };
  const deps = instance
    ? projectService.resolveDependencies(project, instance, version)
    : { optional: [], toInstall: [], conflicts: [], alreadyInstalled: [] };
  const alreadyInstalled = instance?.mods.some((m) => m.projectId === project.id) ?? false;
  const blocked = !instance || !report.compatible || alreadyInstalled || planLoading || Boolean(planError);
  const dependencies = plan.filter((item) => item.projectId !== project.id);

  const toggleOptional = (id: string, on: boolean) => setOptionalPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));

  const install = async () => {
    if (!instance) return;
    setBusy(true);
    try {
      await installMod(instance.id, project, {
        version,
        dependencies: optionalPicked
      });
      onOpenChange(false);
      const extra = dependencies.length;
      toast.success(`${project.name} installed to ${instance.name}${extra ? ` with ${extra} dependencies` : ''}`);
    } catch (error) {
      toast.error(getErrorMessage(error, `Could not install ${project.name}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ProjectIcon size="lg" name={project.name} color={project.iconColor} />
            <div className="flex flex-col">
              <DialogTitle>Install {project.name}</DialogTitle>
              <DialogDescription>
                Version {(version ?? project.latestVersion) || 'latest compatible'} by {project.author}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Install to</span>
            {candidates.length === 0 ? (
              <Alert>
                <TriangleAlert />
                <AlertTitle>No compatible instance</AlertTitle>
                <AlertDescription>Create a {projectService.getGame(project.gameId).name} instance first.</AlertDescription>
              </Alert>
            ) : (
              <Select value={instance?.id} onValueChange={setTarget}>
                <SelectTrigger className="w-full" aria-label="Target instance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {candidates.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        <InstanceIcon size="sm" icon={i.icon} color={i.iconColor} className="size-5 rounded-sm [&>svg]:size-3" />
                        {i.name}
                        <span className="font-mono text-xs text-muted-foreground">{i.gameVersion}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>

          {alreadyInstalled && (
            <Alert>
              <AlertTitle>Already installed</AlertTitle>
              <AlertDescription>
                This project is already part of {instance?.name}. Change its version from the Mods tab.
              </AlertDescription>
            </Alert>
          )}

          {report.issues.map((issue) => (
            <Alert
              key={issue.message}
              variant={issue.severity === 'error' ? 'destructive' : 'default'}
              className={cn(issue.severity === 'warning' && 'border-warning/40 text-warning')}
            >
              {issue.severity === 'error' ? <Ban /> : <TriangleAlert />}
              <AlertTitle>{issue.message}</AlertTitle>
              {issue.remediation && <AlertDescription>{issue.remediation}</AlertDescription>}
            </Alert>
          ))}

          {planLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Resolving the installation plan
            </p>
          )}

          {planError && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Installation plan unavailable</AlertTitle>
              <AlertDescription>{planError}</AlertDescription>
            </Alert>
          )}

          {dependencies.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {dependencies.length} {dependencies.length === 1 ? 'dependency' : 'dependencies'} will also be installed
              </span>
              <ul className="flex flex-col gap-1.5">
                {dependencies.map((dependency) => (
                  <li
                    key={dependency.projectId}
                    className="flex items-center justify-between rounded-md border px-2.5 py-2 text-sm"
                  >
                    <span>{dependency.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{dependency.version}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {deps.optional.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Optional</span>
              <ul className="flex flex-col gap-1.5">
                {deps.optional.map((d) => (
                  <li key={d.projectId} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`opt-${d.projectId}`}
                      checked={optionalPicked.includes(d.projectId)}
                      onCheckedChange={(v) => toggleOptional(d.projectId, v === true)}
                    />
                    <label htmlFor={`opt-${d.projectId}`}>{d.name}</label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={install} disabled={blocked || busy}>
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InstallDialog;
