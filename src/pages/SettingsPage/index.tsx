import type { AppSettings } from '~/domain/interfaces/settings.interface';
import type { RowProps, ToggleRowProps, SectionBodyProps } from './types';

import { useSearchParams } from 'react-router-dom';

import { toast } from 'sonner';
import { Check, FolderOpen } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import GameIcon from '~/components/commons/GameIcon';
import { useAppStore } from '~/usecase/store/appStore';
import PageHeader from '~/components/commons/PageHeader';
import { projectService } from '~/usecase/service/project';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '~/components/ui/card';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

import { SETTINGS_SECTIONS } from './constants';

const SettingsPage = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get('section') ?? 'general';
  const section = SETTINGS_SECTIONS.find((s) => s.toLowerCase() === raw) ?? 'General';
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const patch = (p: Partial<AppSettings>) => updateSettings(p);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader title="Settings" />
      <div className="grid grid-cols-[168px_minmax(0,1fr)] gap-4">
        <nav className="flex flex-col gap-0.5">
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParams(s === 'General' ? {} : { section: s.toLowerCase() })}
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
  if (section === 'General') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Startup and window behaviour.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row label="Language">
            <Select value={settings.language} onValueChange={(language) => patch({ language })}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                  <SelectItem value="es-ES">Español</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>
          <ToggleRow
            label="Launch on system startup"
            checked={settings.launchOnStartup}
            onChange={(launchOnStartup) => patch({ launchOnStartup })}
          />
          <ToggleRow
            label="Close to tray"
            checked={settings.closeToTray}
            onChange={(closeToTray) => patch({ closeToTray })}
            description="Keep downloads running in the background."
          />
        </CardContent>
      </Card>
    );
  }

  if (section === 'Appearance') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme and accent.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row label="Theme">
            <Select value={settings.theme} onValueChange={(theme) => patch({ theme: theme as AppSettings['theme'] })}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Accent hue">
            <div className="flex items-center gap-3">
              <input
                min={0}
                max={360}
                type="range"
                value={settings.accentHue}
                className="w-44 accent-primary"
                onChange={(e) => patch({ accentHue: Number(e.target.value) })}
              />
              <span className="size-6 rounded-full border" style={{ background: `oklch(0.8 0.17 ${settings.accentHue})` }} />
            </div>
          </Row>
        </CardContent>
      </Card>
    );
  }

  if (section === 'Games') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Games</CardTitle>
          <CardDescription>Where each game is installed. Detected automatically when possible.</CardDescription>
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
                {gp.detected ? (
                  <Badge className="gap-1 bg-primary/10 text-primary">
                    <Check />
                    Detected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Missing
                  </Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => toast.info(`Folder picker for ${game.name}`)}>
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
          <Button size="sm" variant="outline" onClick={() => toast.success('Caches reset')}>
            Reset
          </Button>
        </Row>
        <Row label="Export diagnostics" description="Zip with logs and instance manifests.">
          <Button size="sm" variant="outline" onClick={() => toast.success('Diagnostics exported')}>
            Export
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

const ToggleRow = ({ label, checked, onChange, description }: ToggleRowProps) => (
  <Row label={label} description={description}>
    <Switch checked={checked} onCheckedChange={onChange} />
  </Row>
);

export default SettingsPage;
