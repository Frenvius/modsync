import React from 'react';

import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { updaterService } from '~/usecase/service/updater';
import { useUpdaterStore } from '~/usecase/store/updaterStore';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '~/components/ui/card';

const AboutSection = () => {
  const [version, setVersion] = React.useState<null | string>(null);
  const check = useUpdaterStore((s) => s.check);
  const status = useUpdaterStore((s) => s.status);
  const busy = status === 'checking' || status === 'downloading';

  React.useEffect(() => {
    void updaterService.currentVersion().then(setVersion);
  }, []);

  const checkForUpdates = async () => {
    const result = await check();
    const { error, update } = useUpdaterStore.getState();
    if (result === 'up-to-date') toast.success('ModSync is up to date.');
    if (result === 'available') toast.info(`ModSync ${update?.version} is available. Install it from the title bar.`);
    if (result === 'error') toast.error(error ?? 'Could not check for updates.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>About</CardTitle>
        <CardDescription>ModSync checks for updates every time it starts.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <span className="flex flex-1 flex-col">
          <span className="text-sm font-medium">Version</span>
          <span className="font-mono text-xs text-muted-foreground">{version ? `v${version}` : 'Unknown'}</span>
        </span>
        <Button size="sm" disabled={busy} variant="outline" onClick={() => void checkForUpdates()}>
          <RefreshCw data-icon="inline-start" className={status === 'checking' ? 'motion-safe:animate-spin' : undefined} />
          {status === 'checking' ? 'Checking...' : 'Check for updates'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AboutSection;
