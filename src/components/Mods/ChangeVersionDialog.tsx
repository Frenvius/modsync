import type { ProjectVersion } from '~/domain/interfaces/project.interface';
import type { Instance, InstalledMod } from '~/domain/interfaces/instance.interface';

import React from 'react';

import { toast } from 'sonner';
import { Loader2, GitBranch, TriangleAlert } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import { formatDate } from '~/usecase/util/formatUtils';
import { projectService } from '~/usecase/service/project';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import { contentService, type InstallPlanItem } from '~/usecase/service/content';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';
import { Dialog, DialogTitle, DialogFooter, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

interface ChangeVersionDialogProps {
  open: boolean;
  mod?: InstalledMod;
  instance: Instance;
  onOpenChange: (open: boolean) => void;
  onChanged: (projectId: string) => void;
}

const ChangeVersionDialog = ({ mod, open, instance, onChanged, onOpenChange }: ChangeVersionDialogProps) => {
  const updateMod = useAppStore((state) => state.updateMod);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [versions, setVersions] = React.useState<Array<ProjectVersion>>([]);
  const [versionId, setVersionId] = React.useState<string>();
  const [plan, setPlan] = React.useState<Array<InstallPlanItem>>([]);

  React.useEffect(() => {
    if (!open || !mod) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setPlan([]);
    void projectService
      .getVersions(mod.projectId)
      .then((items) =>
        items.filter(
          (item) =>
            (item.gameVersions.length === 0 || item.gameVersions.includes(instance.gameVersion)) &&
            (item.loaders.length === 0 || item.loaders.includes(instance.loader))
        )
      )
      .then((items) => {
        if (cancelled) return;
        setVersions(items);
        setVersionId(items.find((item) => item.id === mod.versionId)?.id ?? items[0]?.id);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getErrorMessage(loadError, 'Could not load compatible versions'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instance.gameVersion, instance.loader, mod, open]);

  React.useEffect(() => {
    if (!open || !mod || !versionId) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void contentService
      .previewUpdate({
        versionId,
        instanceId: instance.id,
        projectId: mod.projectId,
        optionalDependencies: []
      })
      .then((items) => {
        if (!cancelled) setPlan(items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(getErrorMessage(loadError, 'Could not resolve the version change'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instance.id, mod, open, versionId]);

  if (!mod) return null;
  const selected = versions.find((version) => version.id === versionId);
  const dependencies = plan.filter((item) => item.projectId !== mod.projectId);

  const apply = async () => {
    if (!versionId || !selected) return;
    setBusy(true);
    try {
      await updateMod(instance.id, mod.projectId, versionId);
      toast.success(`${mod.name} changed to ${selected.number}`);
      onChanged(mod.projectId);
      onOpenChange(false);
    } catch (updateError) {
      toast.error(getErrorMessage(updateError, `Could not change ${mod.name}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change {mod.name} version</DialogTitle>
          <DialogDescription>The current files remain installed until the selected replacement is verified.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Select value={versionId} onValueChange={setVersionId} disabled={loading || versions.length === 0}>
            <SelectTrigger className="w-full" aria-label="Content version">
              <SelectValue placeholder={loading ? 'Loading compatible versions' : 'Select a version'} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    <span className="font-mono">{version.number}</span>
                    <time dateTime={version.publishedAt} className="text-xs text-muted-foreground">
                      {formatDate(version.publishedAt)}
                    </time>
                    {version.id === mod.versionId && <span className="text-xs text-muted-foreground">Current</span>}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {loading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Checking version consequences
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Version unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {dependencies.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Required changes</span>
              {dependencies.map((item) => (
                <div key={item.projectId} className="flex justify-between rounded-md border px-2.5 py-2 text-sm">
                  <span>{item.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{item.version}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void apply()}
            disabled={
              busy ||
              loading ||
              Boolean(error) ||
              !selected ||
              selected.id === mod.versionId ||
              selected.number === mod.installedVersion
            }
          >
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <GitBranch data-icon="inline-start" />}
            Apply version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeVersionDialog;
