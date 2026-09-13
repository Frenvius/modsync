import type { ProjectVersion } from '~/domain/interfaces/project.interface';
import type { ModSortKey, ModsTabProps, ModStatusFilter, ChangeVersionDialogProps } from '~/components/Instance/types';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, Package } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { useAppStore } from '~/usecase/store/appStore';
import SearchBar from '~/components/commons/SearchBar';
import ModListItem from '~/components/Mods/ModListItem';
import EmptyState from '~/components/commons/EmptyState';
import { projectService } from '~/usecase/service/project';
import ConfirmDialog from '~/components/commons/ConfirmDialog';
import { MOD_STATUS_LABELS } from '~/components/Instance/constants';
import { ProjectType, UpdateStatus } from '~/domain/enums/provider.enum';
import { Table, TableRow, TableBody, TableHead, TableHeader } from '~/components/ui/table';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';
import { Dialog, DialogTitle, DialogFooter, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

const ModsTab = ({ instance, contentType }: ModsTabProps) => {
  const navigate = useNavigate();
  const updateMods = useAppStore((s) => s.updateMods);
  const removeMods = useAppStore((s) => s.removeMods);
  const toggleMod = useAppStore((s) => s.toggleMod);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<ModSortKey>('name');
  const [status, setStatus] = React.useState<ModStatusFilter>('all');
  const [selected, setSelected] = React.useState<Array<string>>([]);
  const [removeTarget, setRemoveTarget] = React.useState<Array<string>>([]);
  const [versionTarget, setVersionTarget] = React.useState<null | string>(null);

  const mods = instance.mods
    .filter((m) => m.type === contentType)
    .filter((m) => status === 'all' || m.status === status)
    .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()) || m.author.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'status'
          ? a.status.localeCompare(b.status)
          : a.provider.localeCompare(b.provider)
    );

  const updatable = mods.filter((m) => m.status === UpdateStatus.UpdateAvailable).map((m) => m.projectId);
  const selectedUpdatable = selected.filter((id) => updatable.includes(id));
  const allSelected = mods.length > 0 && mods.every((m) => selected.includes(m.projectId));

  const toggleAll = (on: boolean) => setSelected(on ? mods.map((m) => m.projectId) : []);
  const select = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  const update = async (ids: Array<string>) => {
    await updateMods(instance.id, ids);
    toast.success(`${ids.length} ${ids.length === 1 ? 'mod' : 'mods'} updated`);
    setSelected([]);
  };

  const remove = () => {
    removeMods(instance.id, removeTarget);
    toast.success(`${removeTarget.length} removed`);
    setSelected((s) => s.filter((id) => !removeTarget.includes(id)));
  };

  const handlers = {
    onUpdate: (id: string) => void update([id]),
    onRemove: (id: string) => setRemoveTarget([id]),
    onChangeVersion: (id: string) => setVersionTarget(id),
    onToggle: (id: string, enabled: boolean) => toggleMod(instance.id, id, enabled)
  };

  const label =
    contentType === ProjectType.Mod
      ? 'mods'
      : contentType === ProjectType.ShaderPack
        ? 'shader packs'
        : contentType === ProjectType.DataPack
          ? 'data packs'
          : 'resource packs';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} className="w-64" onChange={setQuery} placeholder={`Search ${label}`} />
        <Select value={status} onValueChange={(v) => setStatus(v as ModStatusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(Object.keys(MOD_STATUS_LABELS) as Array<ModStatusFilter>).map((k) => (
                <SelectItem key={k} value={k}>
                  {MOD_STATUS_LABELS[k]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as ModSortKey)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
              <SelectItem value="provider">Sort: Source</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="flex-1" />
        {selected.length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedUpdatable.length === 0}
              onClick={() => update(selectedUpdatable)}
            >
              <ArrowUp data-icon="inline-start" />
              Update selected ({selectedUpdatable.length})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRemoveTarget(selected)}>
              <Trash2 data-icon="inline-start" />
              Remove selected
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" disabled={updatable.length === 0} onClick={() => update(updatable)}>
            <ArrowUp data-icon="inline-start" />
            Update all ({updatable.length})
          </Button>
        )}
        <Button size="sm" onClick={() => navigate(`/discover?instance=${instance.id}`)}>
          <Plus data-icon="inline-start" />
          Add {label}
        </Button>
      </div>

      {mods.length === 0 ? (
        <EmptyState
          icon={Package}
          title={`No ${label}`}
          description={query || status !== 'all' ? 'Nothing matches the current filters.' : `Browse Discover to add ${label}.`}
        >
          <Button onClick={() => navigate(`/discover?instance=${instance.id}`)}>
            <Plus data-icon="inline-start" />
            Discover {label}
          </Button>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table className="min-w-[800px] table-fixed">
            <TableHeader className="bg-secondary/60 text-[11px] text-muted-foreground [&_th]:h-8">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-3">
                  <Checkbox checked={allSelected} aria-label="Select all" onCheckedChange={(v) => toggleAll(v === true)} />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Version</TableHead>
                <TableHead className="w-40">Source</TableHead>
                <TableHead className="w-44">Status</TableHead>
                <TableHead className="w-16 text-center">Enabled</TableHead>
                <TableHead className="w-28">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:nth-child(even)]:bg-muted/20">
              {mods.map((m) => (
                <ModListItem
                  mod={m}
                  key={m.projectId}
                  onSelect={select}
                  handlers={handlers}
                  selected={selected.includes(m.projectId)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        destructive
        onConfirm={remove}
        confirmLabel="Remove"
        open={removeTarget.length > 0}
        onOpenChange={(o) => !o && setRemoveTarget([])}
        title={`Remove ${removeTarget.length} ${removeTarget.length === 1 ? 'mod' : 'mods'}?`}
        description="Config files are kept so you can reinstall later without losing settings."
      />
      <ChangeVersionDialog instance={instance} projectId={versionTarget} onOpenChange={(o) => !o && setVersionTarget(null)} />
    </div>
  );
};

const ChangeVersionDialog = ({ instance, projectId, onOpenChange }: ChangeVersionDialogProps) => {
  const changeModVersion = useAppStore((s) => s.changeModVersion);
  const [versions, setVersions] = React.useState<Array<ProjectVersion>>([]);
  const [picked, setPicked] = React.useState<string | undefined>();
  const mod = instance.mods.find((m) => m.projectId === projectId);

  React.useEffect(() => {
    if (!projectId) return;
    setPicked(undefined);
    void projectService.getVersions(projectId).then(setVersions);
  }, [projectId]);

  const apply = () => {
    if (!projectId || !picked) return;
    changeModVersion(instance.id, projectId, picked);
    toast.success(`${mod?.name} switched to ${picked}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={projectId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change version</DialogTitle>
          <DialogDescription>
            {mod?.name} is on {mod?.installedVersion}. Versions not built for {instance.gameVersion} are hidden.
          </DialogDescription>
        </DialogHeader>
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a version" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.number} disabled={v.number === mod?.installedVersion}>
                  <span className="font-mono">{v.number}</span>
                  <span className="text-xs text-muted-foreground">{v.gameVersions[0]}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!picked}>
            Switch version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModsTab;
