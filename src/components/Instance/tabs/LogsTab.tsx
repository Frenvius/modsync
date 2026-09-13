import type { InstanceTabProps } from '~/components/Instance/types';
import type { LogLine } from '~/domain/interfaces/instance.interface';

import React from 'react';

import { toast } from 'sonner';
import { Copy, ScrollText, FolderOpen } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import SearchBar from '~/components/commons/SearchBar';
import { launchService } from '~/usecase/service/launch';
import EmptyState from '~/components/commons/EmptyState';
import { filesystemService } from '~/usecase/service/filesystem';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { LOG_LEVELS, LOG_LEVEL_CLASSES } from '~/components/Instance/constants';

const LogsTab = ({ instance }: InstanceTabProps) => {
  const [query, setQuery] = React.useState('');
  const [lines, setLines] = React.useState<Array<LogLine>>([]);
  const [levels, setLevels] = React.useState<Array<string>>(['info', 'warn', 'error']);
  const visible = lines.filter((line) => levels.includes(line.level) && line.message.toLowerCase().includes(query.toLowerCase()));

  React.useEffect(() => {
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    void launchService
      .onLog(instance.id, (line) => setLines((current) => [...current.slice(-4_999), line]))
      .then((unlisten) => {
        if (disposed) unlisten();
        else unsubscribe = unlisten;
      })
      .catch((error) => toast.error(getErrorMessage(error, 'Could not stream process logs')));
    void launchService
      .logs(instance.id)
      .then((stored) => {
        if (disposed) return;
        setLines((current) =>
          Array.from(
            current
              .reduce(
                (all, line) => all.set(`${line.timestamp}\0${line.level}\0${line.message}`, line),
                new Map(stored.map((line) => [`${line.timestamp}\0${line.level}\0${line.message}`, line]))
              )
              .values()
          ).slice(-5_000)
        );
      })
      .catch((error) => toast.error(getErrorMessage(error, 'Could not load process logs')));
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [instance.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        visible.map((line) => `[${line.timestamp}] [${line.level.toUpperCase()}] ${line.message}`).join('\n')
      );
      toast.success('Log copied');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not copy the log'));
    }
  };

  const openDirectory = async () => {
    try {
      await filesystemService.openDirectory(await launchService.logsDirectory(instance.id));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open the logs folder'));
    }
  };

  if (lines.length === 0) {
    return <EmptyState icon={ScrollText} title="No logs yet" description="Launch the instance to generate a process log." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} className="w-64" onChange={setQuery} placeholder="Filter log" />
        <ToggleGroup size="sm" value={levels} type="multiple" variant="outline" onValueChange={setLevels}>
          {LOG_LEVELS.map((level) => (
            <ToggleGroupItem key={level} value={level} className="uppercase">
              {level}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="flex-1" />
        <Button size="sm" onClick={copy} variant="outline">
          <Copy data-icon="inline-start" />
          Copy
        </Button>
        <Button size="sm" variant="outline" onClick={openDirectory}>
          <FolderOpen data-icon="inline-start" />
          Open folder
        </Button>
      </div>
      <span role="status" className="sr-only">
        {lines.at(-1)?.message}
      </span>
      <pre
        aria-label="Game process log"
        className="max-h-[520px] overflow-auto rounded-lg border bg-[oklch(0.12_0.005_160)] p-4 font-mono text-xs leading-relaxed"
      >
        {visible.map((line, index) => (
          <div key={`${line.timestamp}-${index}`} className={cn('flex gap-3', LOG_LEVEL_CLASSES[line.level])}>
            <span className="shrink-0 text-muted-foreground/60">{line.timestamp.slice(11, 19)}</span>
            <span className="w-12 shrink-0 uppercase">{line.level}</span>
            <span className="whitespace-pre-wrap">{line.message}</span>
          </div>
        ))}
      </pre>
    </div>
  );
};

export default LogsTab;
