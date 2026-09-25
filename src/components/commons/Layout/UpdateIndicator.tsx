import React from 'react';

import { toast } from 'sonner';
import { Download, RefreshCw, ExternalLink, TriangleAlert } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import { formatBytes } from '~/usecase/util/formatUtils';
import { RELEASES_URL } from '~/usecase/service/updater';
import RichContent from '~/components/commons/RichContent';
import { browserService } from '~/usecase/service/browser';
import { useUpdaterStore } from '~/usecase/store/updaterStore';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';

const TITLES = {
  error: 'Update failed',
  available: 'Update available',
  downloading: 'Downloading update'
};

const UpdateIndicator = () => {
  const [open, setOpen] = React.useState(false);
  const error = useUpdaterStore((s) => s.error);
  const status = useUpdaterStore((s) => s.status);
  const update = useUpdaterStore((s) => s.update);
  const install = useUpdaterStore((s) => s.install);
  const dismiss = useUpdaterStore((s) => s.dismiss);
  const progress = useUpdaterStore((s) => s.progress);

  if (!update || !(status === 'available' || status === 'downloading' || status === 'error')) return null;

  const percent = progress.total > 0 ? Math.min(100, (progress.downloaded / progress.total) * 100) : 0;
  const TriggerIcon = status === 'error' ? TriangleAlert : status === 'downloading' ? RefreshCw : Download;

  const later = () => {
    dismiss();
    setOpen(false);
  };
  const openReleasePage = () =>
    void browserService.openExternal(RELEASES_URL).catch(() => toast.error('Could not open link in your browser.'));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${TITLES[status]}: ModSync ${update.version}`}
          className={cn(
            'relative mr-1 flex size-7 items-center justify-center rounded transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            status === 'error' ? 'text-destructive' : 'text-primary'
          )}
        >
          <TriggerIcon
            strokeWidth={1.5}
            aria-hidden="true"
            className={cn('size-4', status === 'downloading' && 'motion-safe:animate-spin')}
          />
          {status === 'available' && (
            <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{TITLES[status]}</span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">v{update.version}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Current version <span className="font-mono">v{update.currentVersion}</span>
        </span>

        {status === 'available' && (
          <>
            {update.notes && <RichContent content={update.notes} className="max-h-60 overflow-y-auto text-xs" />}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => void install()}>
                <Download data-icon="inline-start" />
                Install and restart
              </Button>
              <Button size="sm" variant="ghost" onClick={later}>
                Later
              </Button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <div role="status" className="flex flex-col gap-2">
            <Progress value={percent} aria-label="Update download progress" />
            <span className="flex justify-between font-mono text-xs text-muted-foreground">
              <span>
                {formatBytes(progress.downloaded)}
                {progress.total > 0 && ` / ${formatBytes(progress.total)}`}
              </span>
              <span>{Math.round(percent)}%</span>
            </span>
            <span className="text-xs text-muted-foreground">ModSync restarts when the installer finishes.</span>
          </div>
        )}

        {status === 'error' && (
          <>
            <p role="alert" className="text-xs break-words text-destructive">
              {error}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => void install()}>
                <RefreshCw data-icon="inline-start" />
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={openReleasePage}>
                <ExternalLink data-icon="inline-start" />
                Release page
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default UpdateIndicator;
