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
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';
import { Dialog, DialogTitle, DialogFooter, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

import DependencyList from './DependencyList';

const InstallDialog = ({ open, project, version, instanceId, onOpenChange }: InstallDialogProps) => {
  const instances = useAppStore((s) => s.instances);
  const installMod = useAppStore((s) => s.installMod);
  const [busy, setBusy] = React.useState(false);
  const [target, setTarget] = React.useState<string | undefined>(instanceId);
  const [optionalPicked, setOptionalPicked] = React.useState<Array<string>>([]);

  const candidates = instances.filter((i) => i.gameId === project?.gameId);
  const instance = candidates.find((i) => i.id === target) ?? candidates[0];

  React.useEffect(() => {
    if (open) setTarget(instanceId ?? candidates[0]?.id);
  }, [open, instanceId]);

  if (!project) return null;

  const report = instance ? projectService.checkCompatibility(project, instance) : { issues: [], compatible: false };
  const deps = instance
    ? projectService.resolveDependencies(project, instance)
    : { optional: [], toInstall: [], conflicts: [], alreadyInstalled: [] };
  const alreadyInstalled = instance?.mods.some((m) => m.projectId === project.id) ?? false;
  const blocked = !instance || !report.compatible || alreadyInstalled;

  const toggleOptional = (id: string, on: boolean) => setOptionalPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));

  const install = async () => {
    if (!instance) return;
    setBusy(true);
    await installMod(instance.id, project, {
      version,
      dependencies: [...deps.toInstall.map((d) => d.projectId), ...optionalPicked]
    });
    setBusy(false);
    onOpenChange(false);
    const extra = deps.toInstall.length + optionalPicked.length;
    toast.success(`${project.name} installed to ${instance.name}${extra ? ` with ${extra} dependencies` : ''}`);
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
                Version {version ?? project.latestVersion} by {project.author}
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
                <SelectTrigger className="w-full">
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

          {deps.toInstall.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {deps.toInstall.length} {deps.toInstall.length === 1 ? 'dependency' : 'dependencies'} will also be installed
              </span>
              <DependencyList dependencies={deps.toInstall} />
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
