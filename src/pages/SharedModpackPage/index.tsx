import type { Modpack } from '~/domain/interfaces/modpack.interface';

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Copy, Boxes, Loader2, Download, ShieldCheck } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { LOADER_NAMES } from '~/usecase/mock/games';
import GameIcon from '~/components/commons/GameIcon';
import { useAppStore } from '~/usecase/store/appStore';
import EmptyState from '~/components/commons/EmptyState';
import { projectService } from '~/usecase/service/project';
import { modpackService } from '~/usecase/service/modpack';
import ProjectIcon from '~/components/commons/ProjectIcon';
import { VersionBadge, ProviderBadge } from '~/components/commons/Badges';
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';

const SharedModpackPage = () => {
  const { shareId } = useParams();
  const navigate = useNavigate();
  const instances = useAppStore((s) => s.instances);
  const cloneModpack = useAppStore((s) => s.cloneModpack);
  const importModpack = useAppStore((s) => s.importModpack);
  const installModpack = useAppStore((s) => s.installModpack);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [modpack, setModpack] = React.useState<Modpack | undefined>();

  React.useEffect(() => {
    setLoading(true);
    void modpackService.resolveShared(shareId ?? '').then((m) => {
      setModpack(m);
      setLoading(false);
    });
  }, [shareId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!modpack) {
    return (
      <div className="p-6">
        <EmptyState icon={Boxes} title="Shared modpack not found" description="The link may have expired or the code is wrong." />
      </div>
    );
  }

  const game = projectService.getGame(modpack.gameId);
  const versionMismatch = instances.some((i) => i.gameId === modpack.gameId && i.gameVersion !== modpack.gameVersion);

  const install = async () => {
    setBusy(true);
    importModpack(modpack);
    const instance = await installModpack(modpack.id);
    setBusy(false);
    toast.success(`Instance "${instance.name}" created`);
    navigate(`/instance/${instance.id}`);
  };

  const clone = async () => {
    importModpack(modpack);
    const copy = await cloneModpack(modpack.id);
    toast.success('Cloned into your modpacks');
    navigate(`/modpack/${copy.id}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div
        className="relative flex h-44 items-end overflow-hidden rounded-xl border p-5"
        style={{
          background: `linear-gradient(120deg, ${modpack.coverColor} 0%, color-mix(in oklch, ${modpack.coverColor} 35%, var(--card)) 100%)`
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,oklch(1_0_0/15%),transparent_45%)]" />
        <div className="relative flex flex-col gap-1 text-white">
          <span className="text-xs font-medium tracking-wide uppercase opacity-80">Shared modpack</span>
          <h1 className="text-3xl font-semibold tracking-tight">{modpack.name}</h1>
          <span className="text-sm opacity-90">by {modpack.author}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1.5">
          <GameIcon size="sm" gameId={modpack.gameId} className="size-3.5 rounded-[3px] [&>svg]:size-2.5" />
          {game.name} {modpack.gameVersion}
        </Badge>
        <VersionBadge version={LOADER_NAMES[modpack.loader]} />
        <Badge variant="secondary">{modpack.mods.length} mods</Badge>
        <Badge variant="outline" className="font-mono">
          {modpack.shareCode}
        </Badge>
        <span className="flex-1" />
        <Button onClick={clone} variant="outline">
          <Copy data-icon="inline-start" />
          Clone
        </Button>
        <Button disabled={busy} onClick={install}>
          {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
          Install
        </Button>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{modpack.description}</p>

      {versionMismatch && (
        <Alert>
          <ShieldCheck />
          <AlertTitle>
            Targets {game.name} {modpack.gameVersion}
          </AlertTitle>
          <AlertDescription>
            Your existing instances use a different version. Installing creates a new instance, so nothing breaks.
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Mods</h2>
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {modpack.mods.map((m) => (
            <li key={m.projectId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <ProjectIcon size="sm" name={m.name} color={m.iconColor} />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <ProviderBadge providerId={m.provider} />
              <span className="font-mono text-xs text-muted-foreground">{m.version}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default SharedModpackPage;
