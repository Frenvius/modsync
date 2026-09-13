import type { DownloadItemProps } from './types';

import { X, Check, TriangleAlert } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import { useAppStore } from '~/usecase/store/appStore';
import { DownloadStatus } from '~/domain/enums/provider.enum';
import { formatEta, formatBytes, formatSpeed } from '~/usecase/util/formatUtils';

import { DOWNLOAD_KIND_ICONS } from './constants';

const DownloadItem = ({ item }: DownloadItemProps) => {
  const cancel = useAppStore((s) => s.cancelDownload);
  const Icon = DOWNLOAD_KIND_ICONS[item.kind];
  const active = item.status === DownloadStatus.Active;
  const done = item.status === DownloadStatus.Completed;
  const failed = item.status === DownloadStatus.Failed;
  const cancelled = item.status === DownloadStatus.Cancelled;
  const transferred = Math.round((item.totalBytes * item.progress) / 100);

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3', (done || cancelled) && 'opacity-70')}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground',
            done && 'bg-primary/10 text-primary',
            failed && 'bg-destructive/15 text-destructive'
          )}
        >
          {done ? <Check className="size-4" /> : failed ? <TriangleAlert className="size-4" /> : <Icon className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {item.subtitle} · {item.step}
          </span>
        </div>
        <span className="text-right text-xs text-muted-foreground tabular-nums">
          {active && item.bytesPerSecond > 0 && (
            <>
              {formatSpeed(item.bytesPerSecond)}
              {item.etaSeconds > 0 && <span className="ml-2">{formatEta(item.etaSeconds)} left</span>}
            </>
          )}
          {!active && `${formatBytes(transferred)} / ${formatBytes(item.totalBytes)}`}
        </span>
        <span className="flex items-center gap-1">
          {(active || item.status === DownloadStatus.Queued) && (
            <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => void cancel(item.id)}>
              <X />
            </Button>
          )}
        </span>
      </div>
      {!done && !cancelled && (
        <Progress
          value={item.progress}
          className={cn(
            'h-1.5',
            failed && '[&>div]:bg-destructive',
            item.status === DownloadStatus.Paused && '[&>div]:bg-muted-foreground'
          )}
        />
      )}
    </div>
  );
};

export default DownloadItem;
