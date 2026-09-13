import type { ModSortKey, ModsTabProps, ModStatusFilter } from '~/components/Instance/types';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Plus, Package, FileQuestion } from 'lucide-react';

import { Button } from '~/components/ui/button';
import SearchBar from '~/components/commons/SearchBar';
import { useAppStore } from '~/usecase/store/appStore';
import ModListItem from '~/components/Mods/ModListItem';
import EmptyState from '~/components/commons/EmptyState';
import { ProjectType } from '~/domain/enums/provider.enum';
import ConfirmDialog from '~/components/commons/ConfirmDialog';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { MOD_STATUS_LABELS } from '~/components/Instance/constants';
import { contentService, type UnmanagedContent } from '~/usecase/service/content';
import { Table, TableRow, TableBody, TableHead, TableHeader } from '~/components/ui/table';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

const ModsTab = ({ instance, contentType }: ModsTabProps) => {
  const navigate = useNavigate();
  const removeMods = useAppStore((state) => state.removeMods);
  const repairMod = useAppStore((state) => state.repairMod);
  const toggleMod = useAppStore((state) => state.toggleMod);
  const importLocalMod = useAppStore((state) => state.importLocalMod);
  const refreshContent = useAppStore((state) => state.refreshContent);
  const [unmanaged, setUnmanaged] = React.useState<Array<UnmanagedContent>>([]);
  const [query, setQuery] = React.useState('');
  const [removeTarget, setRemoveTarget] = React.useState<string>();
  const [sort, setSort] = React.useState<ModSortKey>('name');
  const [status, setStatus] = React.useState<ModStatusFilter>('all');

  React.useEffect(() => {
    let cancelled = false;
    void refreshContent(instance.id)
      .then(() => contentService.listUnmanaged(instance.id))
      .then((items) => {
        if (!cancelled) setUnmanaged(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(getErrorMessage(error, 'Could not scan local content'));
      });
    return () => {
      cancelled = true;
    };
  }, [instance.id, instance.updatedAt, refreshContent]);

  const mods = instance.mods
    .filter((mod) => mod.type === contentType)
    .filter((mod) => status === 'all' || mod.status === status)
    .filter(
      (mod) => mod.name.toLowerCase().includes(query.toLowerCase()) || mod.author.toLowerCase().includes(query.toLowerCase())
    )
    .sort((left, right) =>
      sort === 'name'
        ? left.name.localeCompare(right.name)
        : sort === 'status'
          ? left.status.localeCompare(right.status)
          : left.provider.localeCompare(right.provider)
    );

  const importLocal = async (path: string) => {
    try {
      await importLocalMod(instance.id, path);
      setUnmanaged((items) => items.filter((item) => item.path !== path));
      toast.success('Local content imported');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not import local content'));
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    try {
      const warnings = await removeMods(instance.id, [removeTarget]);
      setRemoveTarget(undefined);
      if (warnings.length > 0) toast.warning(warnings.join(' '));
      else toast.success('Content removed');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not remove content'));
    }
  };

  const repair = async (projectId: string) => {
    try {
      await repairMod(instance.id, projectId);
      toast.success('Content repaired');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not repair content'));
    }
  };

  const toggle = async (projectId: string, enabled: boolean) => {
    try {
      await toggleMod(instance.id, projectId, enabled);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not change the content state'));
    }
  };

  const label =
    contentType === ProjectType.Mod
      ? 'mods'
      : contentType === ProjectType.ShaderPack
        ? 'shader packs'
        : contentType === ProjectType.DataPack
          ? 'data packs'
          : 'resource packs';
  const visibleUnmanaged = unmanaged.filter((item) => item.type === contentType);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} className="w-64" onChange={setQuery} placeholder={`Search ${label}`} />
        <Select value={status} onValueChange={(value) => setStatus(value as ModStatusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(Object.keys(MOD_STATUS_LABELS) as Array<ModStatusFilter>).map((key) => (
                <SelectItem key={key} value={key}>
                  {MOD_STATUS_LABELS[key]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as ModSortKey)}>
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
        <Button size="sm" onClick={() => navigate(`/discover?instance=${instance.id}`)}>
          <Plus data-icon="inline-start" />
          Add {label}
        </Button>
      </div>

      {visibleUnmanaged.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileQuestion className="size-4 text-warning" />
            Unmanaged files
          </h2>
          <p className="text-xs text-muted-foreground">These files are present on disk but are not tracked by this instance.</p>
          {visibleUnmanaged.map((item) => (
            <div key={item.path} className="flex items-center gap-3 rounded-md border bg-card px-2.5 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{item.path}</span>
              <Button size="xs" variant="secondary" onClick={() => void importLocal(item.path)}>
                Import
              </Button>
            </div>
          ))}
        </section>
      )}

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
          <Table className="min-w-[680px] table-fixed">
            <TableHeader className="bg-secondary/60 text-[11px] text-muted-foreground [&_th]:h-8">
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Version</TableHead>
                <TableHead className="w-40">Source</TableHead>
                <TableHead className="w-44">Status</TableHead>
                <TableHead className="w-20 text-center">Enabled</TableHead>
                <TableHead className="w-20">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:nth-child(even)]:bg-muted/20">
              {mods.map((mod) => (
                <ModListItem
                  mod={mod}
                  key={mod.projectId}
                  onRemove={setRemoveTarget}
                  onRepair={(projectId) => void repair(projectId)}
                  onToggle={(projectId, enabled) => void toggle(projectId, enabled)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        destructive
        confirmLabel="Remove"
        open={Boolean(removeTarget)}
        onConfirm={() => void remove()}
        title="Remove installed content?"
        onOpenChange={(open) => !open && setRemoveTarget(undefined)}
        description="Tracked files are removed. Modified files are preserved and reported."
      />
    </div>
  );
};

export default ModsTab;
