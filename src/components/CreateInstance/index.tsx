import type { WizardDraft, SummaryProps } from './types';
import type { GameId } from '~/domain/enums/provider.enum';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Loader2, ArrowLeft, ArrowRight } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import { projectService } from '~/usecase/service/project';
import { Dialog, DialogTitle, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

import GameStep from './GameStep';
import LoaderStep from './LoaderStep';
import VersionStep from './VersionStep';
import IdentityStep from './IdentityStep';
import { STEPS, EMPTY_WIZARD_DRAFT } from './constants';

const CreateInstanceDialog = () => {
  const navigate = useNavigate();
  const open = useAppStore((s) => s.createInstanceOpen);
  const setOpen = useAppStore((s) => s.setCreateInstanceOpen);
  const createInstance = useAppStore((s) => s.createInstance);
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState<WizardDraft>(EMPTY_WIZARD_DRAFT);

  const game = draft.gameId ? projectService.getGame(draft.gameId) : undefined;
  const skipLoader = (game?.loaders.length ?? 0) <= 1;

  const patch = (p: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...p }));

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setStep(0);
      setDraft(EMPTY_WIZARD_DRAFT);
    }
  };

  const pickGame = (gameId: GameId) => {
    const g = projectService.getGame(gameId);
    setDraft({
      ...EMPTY_WIZARD_DRAFT,
      gameId,
      color: g.color,
      gameVersion: g.versions[0],
      loader: g.loaders.find((l) => l.recommended)?.id ?? g.loaders[0].id
    });
    setStep(1);
  };

  const canContinue = [
    Boolean(draft.gameId),
    Boolean(draft.gameVersion),
    Boolean(draft.loader),
    draft.name.trim().length > 1,
    true
  ][step];

  const next = () => {
    if (step === 1 && skipLoader) return setStep(3);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => {
    if (step === 3 && skipLoader) return setStep(1);
    setStep((s) => Math.max(s - 1, 0));
  };

  const create = async () => {
    if (!draft.gameId || !draft.gameVersion || !draft.loader) return;
    setBusy(true);
    const instance = await createInstance({
      icon: draft.icon,
      gameId: draft.gameId,
      loader: draft.loader,
      iconColor: draft.color,
      name: draft.name.trim(),
      gameVersion: draft.gameVersion
    });
    setBusy(false);
    close(false);
    toast.success(`Instance "${instance.name}" created`);
    navigate(`/instance/${instance.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Create instance</DialogTitle>
          <DialogDescription>Choose a game, version and loader. Mods come after.</DialogDescription>
          <ol className="mt-2 flex items-center gap-1 text-[11px] font-medium">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-1">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 transition-colors',
                    i === step ? 'bg-primary text-primary-foreground' : i < step ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="min-h-[320px] flex-1 overflow-y-auto p-4">
          {step === 0 && <GameStep onSelect={pickGame} selected={draft.gameId} />}
          {step === 1 && game && (
            <VersionStep game={game} value={draft.gameVersion} onChange={(gameVersion) => patch({ gameVersion })} />
          )}
          {step === 2 && game && <LoaderStep game={game} value={draft.loader} onChange={(loader) => patch({ loader })} />}
          {step === 3 && <IdentityStep draft={draft} onChange={patch} />}
          {step === 4 && game && <Summary draft={draft} gameName={game.name} />}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button onClick={back} variant="ghost" disabled={step === 0}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={!canContinue}>
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button disabled={busy} onClick={create}>
              {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
              Create instance
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Summary = ({ draft, gameName }: SummaryProps) => (
  <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
    <dt className="text-muted-foreground">Name</dt>
    <dd className="font-medium">{draft.name}</dd>
    <dt className="text-muted-foreground">Game</dt>
    <dd>{gameName}</dd>
    <dt className="text-muted-foreground">Version</dt>
    <dd className="font-mono">{draft.gameVersion}</dd>
    <dt className="text-muted-foreground">Loader</dt>
    <dd className="capitalize">{draft.loader}</dd>
  </dl>
);

export default CreateInstanceDialog;
