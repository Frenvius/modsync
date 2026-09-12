import type { Instance, ConfigFile } from '~/domain/interfaces/instance.interface';

import React from 'react';
import { toast } from 'sonner';
import { Save, FileCode, FolderOpen } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import EmptyState from '~/components/commons/EmptyState';
import { formatBytes, formatRelative } from '~/usecase/util/formatUtils';

interface ConfigTabProps {
  instance: Instance;
}

const sampleContent = (file: ConfigFile) => {
  if (file.format === 'json') return '{\n  "enabled": true,\n  "renderDistance": 12,\n  "vsync": false\n}';
  if (file.format === 'toml') return '[general]\nenabled = true\n\n[client]\nshowOverlay = true\nscale = 1.0';
  if (file.format === 'properties') return 'enabled=true\nlogLevel=info\nmaxThreads=4';
  return '[General]\n## Enable the mod\nEnabled = true\n\n[Logging]\nLogLevel = Info';
};

const ConfigTab = ({ instance }: ConfigTabProps) => {
  const [active, setActive] = React.useState<ConfigFile | undefined>(instance.configs[0]);
  const [content, setContent] = React.useState(active ? sampleContent(active) : '');
  const [dirty, setDirty] = React.useState(false);

  const openFile = (file: ConfigFile) => {
    setActive(file);
    setContent(sampleContent(file));
    setDirty(false);
  };

  const edit = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setDirty(true);
  };

  const save = () => {
    setDirty(false);
    toast.success(`${active?.path} saved`);
  };

  if (instance.configs.length === 0) {
    return <EmptyState icon={FileCode} title="No config files" description="Config files appear after the first launch." />;
  }

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4">
      <div className="flex flex-col gap-1 rounded-lg border bg-card p-1">
        {instance.configs.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => openFile(file)}
            className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent', active?.path === file.path && 'bg-accent')}
          >
            <FileCode className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-xs">{file.path}</span>
              <span className="text-[11px] text-muted-foreground">
                {formatBytes(file.size)} · {formatRelative(file.modifiedAt)}
              </span>
            </span>
          </button>
        ))}
        <Button size="sm" variant="ghost" className="mt-1 justify-start" onClick={() => toast.info('Opened config folder')}>
          <FolderOpen data-icon="inline-start" />
          Open folder
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{active?.path}</span>
          <Badge variant="outline" className="uppercase">
            {active?.format}
          </Badge>
          <span className="flex-1" />
          <Button size="sm" disabled={!dirty} onClick={save}>
            <Save data-icon="inline-start" />
            Save
          </Button>
        </div>
        <Textarea
          value={content}
          spellCheck={false}
          className="min-h-[360px] resize-y font-mono text-xs leading-relaxed"
          onChange={edit}
        />
      </div>
    </div>
  );
};

export default ConfigTab;
