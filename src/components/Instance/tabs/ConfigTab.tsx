import type { InstanceTabProps } from '~/components/Instance/types';
import type { ConfigFile } from '~/domain/interfaces/instance.interface';

import React from 'react';

import { toast } from 'sonner';
import { Save, Loader2, FileCode, FolderOpen } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import EmptyState from '~/components/commons/EmptyState';
import { filesystemService } from '~/usecase/service/filesystem';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { configurationService } from '~/usecase/service/configuration';
import { formatBytes, formatRelative } from '~/usecase/util/formatUtils';

const ConfigTab = ({ instance }: InstanceTabProps) => {
  const [files, setFiles] = React.useState<Array<ConfigFile>>([]);
  const [active, setActive] = React.useState<ConfigFile>();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [content, setContent] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const readOnly = instance.ownership === 'joined';

  const openFile = React.useCallback(
    async (file: ConfigFile) => {
      try {
        const value = await configurationService.read(instance.id, file.path);
        setActive(file);
        setContent(value);
        setDirty(false);
      } catch (error) {
        toast.error(getErrorMessage(error, 'Could not read the configuration file'));
      }
    },
    [instance.id]
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void configurationService
      .list(instance.id)
      .then(async (next) => {
        if (cancelled) return;
        setFiles(next);
        if (next[0]) await openFile(next[0]);
      })
      .catch((error) => toast.error(getErrorMessage(error, 'Could not list configuration files')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [instance.id, openFile]);

  const edit = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(event.target.value);
    setDirty(true);
  };

  const selectFile = (file: ConfigFile) => {
    if (dirty && !window.confirm('Discard unsaved configuration changes?')) return;
    void openFile(file);
  };

  const save = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const updated = await configurationService.write(instance.id, active.path, content);
      setFiles((current) => current.map((file) => (file.path === updated.path ? updated : file)));
      setActive(updated);
      setDirty(false);
      toast.success('Configuration saved');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save the configuration file'));
    } finally {
      setSaving(false);
    }
  };

  const openDirectory = async () => {
    try {
      await filesystemService.openDirectory(await configurationService.directory(instance.id));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open the configuration folder'));
    }
  };

  if (loading) {
    return <EmptyState icon={Loader2} title="Loading configuration files" description="Scanning the instance configuration." />;
  }

  if (files.length === 0) {
    return (
      <EmptyState icon={FileCode} title="No config files" description="Config files appear after a mod or game creates them." />
    );
  }

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4">
      <div className="flex flex-col gap-1 rounded-lg border bg-card p-1">
        {files.map((file) => (
          <button
            type="button"
            key={file.path}
            onClick={() => selectFile(file)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
              active?.path === file.path && 'bg-accent'
            )}
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
        {!readOnly && (
          <Button size="sm" variant="ghost" onClick={openDirectory} className="mt-1 justify-start">
            <FolderOpen data-icon="inline-start" />
            Open folder
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{active?.path}</span>
          {active && (
            <Badge variant="outline" className="uppercase">
              {active.format}
            </Badge>
          )}
          <span className="flex-1" />
          {readOnly ? (
            <Badge variant="secondary">Owner controlled</Badge>
          ) : (
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
              Save
            </Button>
          )}
        </div>
        <Textarea
          value={content}
          onChange={edit}
          spellCheck={false}
          disabled={!active}
          readOnly={readOnly}
          className="min-h-[360px] resize-y font-mono text-xs leading-relaxed"
          aria-label={readOnly ? 'Configuration file content, read only' : 'Configuration file content'}
        />
      </div>
    </div>
  );
};

export default ConfigTab;
