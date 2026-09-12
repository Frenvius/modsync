import type { Instance, LogLine } from '~/domain/interfaces/instance.interface';

import React from 'react';
import { toast } from 'sonner';
import { Copy, ScrollText, FolderOpen } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import SearchBar from '~/components/commons/SearchBar';
import EmptyState from '~/components/commons/EmptyState';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';

interface LogsTabProps {
  instance: Instance;
}

const LEVEL_CLASS: Record<LogLine['level'], string> = {
  info: 'text-foreground',
  warn: 'text-warning',
  error: 'text-destructive',
  debug: 'text-muted-foreground'
};

const LEVELS: Array<LogLine['level']> = ['debug', 'info', 'warn', 'error'];

const LogsTab = ({ instance }: LogsTabProps) => {
  const [query, setQuery] = React.useState('');
  const [levels, setLevels] = React.useState<Array<string>>(['info', 'warn', 'error']);
  const lines = instance.logs.filter((l) => levels.includes(l.level) && l.message.toLowerCase().includes(query.toLowerCase()));

  const copy = async () => {
    await navigator.clipboard.writeText(lines.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n')).catch(() => undefined);
    toast.success('Log copied');
  };

  if (instance.logs.length === 0) {
    return <EmptyState icon={ScrollText} title="No logs yet" description="Launch the instance to generate a log." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} onChange={setQuery} placeholder="Filter log" className="w-64" />
        <ToggleGroup type="multiple" variant="outline" size="sm" value={levels} onValueChange={setLevels}>
          {LEVELS.map((l) => (
            <ToggleGroupItem key={l} value={l} className="uppercase">
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy data-icon="inline-start" />
          Copy
        </Button>
        <Button size="sm" variant="outline" onClick={() => toast.info('Opened logs folder')}>
          <FolderOpen data-icon="inline-start" />
          Open folder
        </Button>
      </div>
      <pre className="max-h-[520px] overflow-auto rounded-lg border bg-[oklch(0.12_0.005_160)] p-4 font-mono text-xs leading-relaxed">
        {lines.map((l, i) => (
          <div key={i} className={cn('flex gap-3', LEVEL_CLASS[l.level])}>
            <span className="shrink-0 text-muted-foreground/60">{l.timestamp.slice(11, 19)}</span>
            <span className="w-12 shrink-0 uppercase">{l.level}</span>
            <span className="whitespace-pre-wrap">{l.message}</span>
          </div>
        ))}
      </pre>
    </div>
  );
};

export default LogsTab;
