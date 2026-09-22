import type { RowProps, SectionBodyProps } from './types';
import type { GameId } from '~/domain/enums/provider.enum';
import type { LaunchMode, AppSettings } from '~/domain/interfaces/settings.interface';

import { useSearchParams } from 'react-router-dom';

import { toast } from 'sonner';
import { Check, FolderOpen } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import GameIcon from '~/components/commons/GameIcon';
import { useAppStore } from '~/usecase/store/appStore';
import PageHeader from '~/components/commons/PageHeader';
import { projectService } from '~/usecase/service/project';
import { filesystemService } from '~/usecase/service/filesystem';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '~/components/ui/card';
import { Select, SelectItem, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

import { STEAM_GAMES, SETTINGS_SECTIONS, LAUNCH_MODE_LABELS } from './constants';

const SettingsPage = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get('section') ?? 'games';
  const section = SETTINGS_SECTIONS.find((s) => s.toLowerCase() === raw) ?? 'Games';
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const patch = async (next: Partial<AppSettings>) => {
    try {
      await updateSettings(next);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save settings'));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Settings" />
      <div className="grid grid-cols-[168px_minmax(0,1fr)] gap-4">
        <nav className="flex flex-col gap-0.5">
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParams(s === 'Games' ? {} : { section: s.toLowerCase() })}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                s === section && 'bg-accent text-foreground'
              )}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="flex max-w-2xl flex-col gap-4">
          <SectionBody patch={patch} section={section} settings={settings} />
        </div>
      </div>
    </div>
  );
};

const SectionBody = ({ patch, section, settings }: SectionBodyProps) => {
  const setLaunchMode = (gameId: GameId, launchMode: LaunchMode) =>
    patch({
      gamePaths: settings.gamePaths.map((gamePath) => (gamePath.gameId === gameId ? { ...gamePath, launchMode } : gamePath))
    });

  const browseGamePath = async (gameId: AppSettings['gamePaths'][number]['gameId']) => {
    try {
      const path = await filesystemService.chooseDirectory();
      if (!path) return;
      await patch({
        gamePaths: settings.gamePaths.map((gamePath) =>
          gamePath.gameId === gameId ? { ...gamePath, path, detected: false } : gamePath
        )
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not select the game folder'));
    }
  };

  if (section === 'Games') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Games</CardTitle>
          <CardDescription>
            Where each game is installed, and how it starts. Steam keeps the overlay and its screenshot key working.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {settings.gamePaths.map((gp) => {
            const game = projectService.getGame(gp.gameId);
            return (
              <div key={gp.gameId} className="flex items-center gap-3">
                <GameIcon size="md" gameId={gp.gameId} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{game.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{gp.path || 'Not configured'}</span>
                </span>
                {gp.path ? (
                  <Badge className="gap-1 bg-primary/10 text-primary">
                    <Check />
                    {gp.detected ? 'Detected' : 'Configured'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Missing
                  </Badge>
                )}
                {STEAM_GAMES.includes(gp.gameId) && (
                  <Select value={gp.launchMode} onValueChange={(value) => setLaunchMode(gp.gameId, value as LaunchMode)}>
                    <SelectTrigger size="sm" className="w-28" aria-label={`Launch mode for ${game.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(LAUNCH_MODE_LABELS) as Array<LaunchMode>).map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {LAUNCH_MODE_LABELS[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" variant="outline" onClick={() => browseGamePath(gp.gameId)}>
                  <FolderOpen data-icon="inline-start" />
                  Browse
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced</CardTitle>
        <CardDescription>Diagnostics and experimental behaviour.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Row label="Reset provider caches" description="Forces a full re-index on next search.">
          <Button disabled size="sm" variant="outline">
            Not available yet
          </Button>
        </Row>
        <Row label="Export diagnostics" description="Zip with logs and instance manifests.">
          <Button disabled size="sm" variant="outline">
            Not available yet
          </Button>
        </Row>
      </CardContent>
    </Card>
  );
};

const Row = ({ label, children, description }: RowProps) => (
  <div className="flex items-center gap-4">
    <span className="flex flex-1 flex-col">
      <span className="text-sm font-medium">{label}</span>
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
    </span>
    {children}
  </div>
);

export default SettingsPage;
