import type { Modpack, ModpackMod } from '~/domain/interfaces/modpack.interface';

import React from 'react';
import { toast } from 'sonner';
import { useParams, useNavigate } from 'react-router-dom';
import { Pin, Plus, Copy, Boxes, Trash2, Share2, Pencil, PinOff, Loader2, Download, FileDown, MoreHorizontal } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { DependencyType } from '~/domain/enums/provider.enum';
import { PROJECTS, PROJECT_VERSIONS } from '~/usecase/mock/projects';
import GameIcon from '~/components/commons/GameIcon';
import SearchBar from '~/components/commons/SearchBar';
import EmptyState from '~/components/commons/EmptyState';
import { projectService } from '~/usecase/service/project';
import { modpackService } from '~/usecase/service/modpack';
import ShareDialog from '~/components/Modpack/ShareDialog';
import ProjectIcon from '~/components/commons/ProjectIcon';
import ConfirmDialog from '~/components/commons/ConfirmDialog';
import DependencyList from '~/components/Mods/DependencyList';
import { useAppStore, useModpack } from '~/usecase/store/appStore';
import { ProviderBadge, VersionBadge } from '~/components/commons/Badges';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '~/components/ui/tabs';
import { formatDate, formatRelative } from '~/usecase/util/formatUtils';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '~/components/ui/dropdown-menu';
import { Dialog, DialogTitle, DialogFooter, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

const ModpackPage = () => {
  const { modpackId } = useParams();
  const navigate = useNavigate();
  const modpack = useModpack(modpackId);
  const cloneModpack = useAppStore((s) => s.cloneModpack);
  const deleteModpack = useAppStore((s) => s.deleteModpack);
  const updateModpack = useAppStore((s) => s.updateModpack);
  const installModpack = useAppStore((s) => s.installModpack);
  const [busy, setBusy] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  if (!modpack) {
    return (
      <div className="p-6">
        <EmptyState icon={Boxes} title="Modpack not found">
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to modpacks
          </Button>
        </EmptyState>
      </div>
    );
  }

  const game = projectService.getGame(modpack.gameId);
  const uniqueDeps = modpack.mods
    .flatMap((m) => PROJECT_VERSIONS[m.projectId]?.[0]?.dependencies ?? [])
    .filter((d) => d.type === DependencyType.Required)
    .filter((d, i, arr) => arr.findIndex((x) => x.projectId === d.projectId) === i && !modpack.mods.some((m) => m.projectId === d.projectId));

  const install = async () => {
    setBusy(true);
    const instance = await installModpack(modpack.id);
    setBusy(false);
    toast.success(`Instance "${instance.name}" created from modpack`);
    navigate(`/instance/${instance.id}`);
  };

  const clone = async () => {
    const copy = await cloneModpack(modpack.id);
    toast.success(`Cloned as "${copy.name}"`);
    navigate(`/modpack/${copy.id}`);
  };

  const exportPack = async () => {
    await navigator.clipboard.writeText(modpackService.exportToJson(modpack)).catch(() => undefined);
    toast.success('Modpack JSON copied to clipboard');
  };

  const remove = () => {
    deleteModpack(modpack.id);
    toast.success('Modpack deleted');
    navigate('/');
  };

  const togglePin = (projectId: string) =>
    updateModpack(modpack.id, { mods: modpack.mods.map((m) => (m.projectId === projectId ? { ...m, pinned: !m.pinned } : m)) });

  const removeMod = (projectId: string) => updateModpack(modpack.id, { mods: modpack.mods.filter((m) => m.projectId !== projectId) });

  const addMod = (mod: ModpackMod) => {
    updateModpack(modpack.id, { mods: [...modpack.mods, mod] });
    toast.success(`${mod.name} added`);
  };

  return (
    <div className="flex flex-col">
      <div
        className="relative h-40 shrink-0"
        style={{ background: `linear-gradient(120deg, ${modpack.coverColor} 0%, color-mix(in oklch, ${modpack.coverColor} 35%, var(--background)) 70%, var(--background) 100%)` }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,oklch(1_0_0/15%),transparent_45%)]" />
      </div>
      <div className="-mt-14 flex flex-col gap-6 px-6 pb-6">
        <div className="flex items-end gap-5">
          <span
            className="flex size-24 shrink-0 items-center justify-center rounded-2xl border-4 border-background text-white shadow-lg"
            style={{ background: `linear-gradient(145deg, ${modpack.coverColor}, color-mix(in oklch, ${modpack.coverColor} 50%, black))` }}
          >
            <Boxes className="size-10" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pb-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              Modpack · by {modpack.author} · v{modpack.version} · updated {formatRelative(modpack.updatedAt)}
            </span>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{modpack.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <GameIcon size="sm" gameId={modpack.gameId} className="size-3.5 rounded-[3px] [&>svg]:size-2.5" />
                {game.name}
              </Badge>
              <VersionBadge version={modpack.gameVersion} loader={modpack.loader} />
              <Badge variant="secondary">{modpack.mods.length} mods</Badge>
              <Badge variant="outline" className="font-mono">
                {modpack.shareCode}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Button variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 data-icon="inline-start" />
              Share
            </Button>
            <Button disabled={busy} onClick={install}>
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
              Create instance
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil />
                    Edit metadata
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={clone}>
                    <Copy />
                    Clone
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportPack}>
                    <FileDown />
                    Export
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{modpack.description}</p>

        <Tabs defaultValue="mods">
          <TabsList variant="line">
            <TabsTrigger value="mods">Mods</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="changelog">Changelog</TabsTrigger>
          </TabsList>

          <TabsContent value="mods" className="flex flex-col gap-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Pinned mods keep their exact version when the pack is installed.</span>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus data-icon="inline-start" />
                Add mod
              </Button>
            </div>
            {modpack.mods.length === 0 ? (
              <EmptyState icon={Boxes} title="No mods yet" description="Add mods from the catalog." />
            ) : (
              <div className="rounded-lg border bg-card">
                {modpack.mods.map((m) => (
                  <div key={m.projectId} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                    <ProjectIcon size="md" name={m.name} color={m.iconColor} />
                    <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => navigate(`/project/${m.projectId}`)}>
                      {m.name}
                    </button>
                    <ProviderBadge providerId={m.provider} />
                    <span className={cn('flex items-center gap-1 font-mono text-xs tabular-nums', m.pinned ? 'text-foreground' : 'text-muted-foreground')}>
                      {m.pinned && <Pin className="size-3" />}
                      {m.version}
                    </span>
                    <Button size="icon-xs" variant="ghost" aria-label={m.pinned ? 'Unpin version' : 'Pin version'} onClick={() => togglePin(m.projectId)}>
                      {m.pinned ? <PinOff /> : <Pin />}
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => removeMod(m.projectId)}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="dependencies" className="pt-2">
            <p className="mb-3 text-xs text-muted-foreground">Required by mods in this pack but not listed. They are installed automatically.</p>
            <DependencyList dependencies={uniqueDeps} />
          </TabsContent>

          <TabsContent value="versions" className="pt-2">
            <ul className="flex flex-col divide-y rounded-lg border bg-card">
              {modpack.releases.map((r, i) => (
                <li key={r.version} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-mono font-medium">v{r.version}</span>
                  {i === 0 && <Badge className="bg-primary/10 text-primary">Current</Badge>}
                  <span className="flex-1 truncate text-muted-foreground">{r.changelog}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="changelog" className="flex flex-col gap-4 pt-2">
            {modpack.releases.map((r) => (
              <article key={r.version} className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  v{r.version}
                  <span className="text-xs font-normal text-muted-foreground">{formatDate(r.date)}</span>
                </h3>
                <p className="text-sm text-muted-foreground">{r.changelog}</p>
              </article>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <ShareDialog modpack={shareOpen ? modpack : null} onOpenChange={setShareOpen} />
      <EditMetadataDialog open={editOpen} modpack={modpack} onOpenChange={setEditOpen} />
      <AddModDialog open={addOpen} modpack={modpack} onAdd={addMod} onOpenChange={setAddOpen} />
      <ConfirmDialog
        destructive
        open={confirmDelete}
        onConfirm={remove}
        confirmLabel="Delete"
        onOpenChange={setConfirmDelete}
        title={`Delete "${modpack.name}"?`}
        description="Instances created from it are not affected."
      />
    </div>
  );
};

interface EditMetadataDialogProps {
  open: boolean;
  modpack: Modpack;
  onOpenChange: (open: boolean) => void;
}

const EditMetadataDialog = ({ open, modpack, onOpenChange }: EditMetadataDialogProps) => {
  const updateModpack = useAppStore((s) => s.updateModpack);
  const [name, setName] = React.useState(modpack.name);
  const [version, setVersion] = React.useState(modpack.version);
  const [gameVersion, setGameVersion] = React.useState(modpack.gameVersion);
  const [description, setDescription] = React.useState(modpack.description);
  const game = projectService.getGame(modpack.gameId);

  const save = () => {
    updateModpack(modpack.id, { name, version, gameVersion, description });
    onOpenChange(false);
    toast.success('Modpack updated');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit modpack</DialogTitle>
          <DialogDescription>Metadata shown to anyone you share it with.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mp-name">Name</Label>
            <Input id="mp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mp-version">Pack version</Label>
              <Input id="mp-version" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mp-gv">Game version</Label>
              <Input id="mp-gv" list="mp-gv-list" value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} />
              <datalist id="mp-gv-list">
                {game.versions.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mp-desc">Description</Label>
            <Textarea id="mp-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface AddModDialogProps {
  open: boolean;
  modpack: Modpack;
  onAdd: (mod: ModpackMod) => void;
  onOpenChange: (open: boolean) => void;
}

const AddModDialog = ({ open, modpack, onAdd, onOpenChange }: AddModDialogProps) => {
  const [query, setQuery] = React.useState('');
  const candidates = PROJECTS.filter(
    (p) => p.gameId === modpack.gameId && !modpack.mods.some((m) => m.projectId === p.id) && p.name.toLowerCase().includes(query.toLowerCase())
  );

  const add = (projectId: string) => {
    const p = PROJECTS.find((x) => x.id === projectId)!;
    onAdd({ name: p.name, pinned: false, version: p.latestVersion, provider: p.provider.id, projectId: p.id, iconColor: p.iconColor });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add mods</DialogTitle>
          <DialogDescription>Compatible with {projectService.getGame(modpack.gameId).name}.</DialogDescription>
        </DialogHeader>
        <SearchBar autoFocus value={query} onChange={setQuery} placeholder="Search catalog" />
        <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-md border">
          {candidates.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nothing to add.</li>}
          {candidates.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <ProjectIcon size="sm" name={p.name} color={p.iconColor} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{p.latestVersion}</span>
              <Button size="xs" variant="secondary" onClick={() => add(p.id)}>
                <Plus data-icon="inline-start" />
                Add
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

export default ModpackPage;
