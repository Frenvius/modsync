import type { SwitchRowProps, InstanceTabProps } from '~/components/Instance/types';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import { GameId } from '~/domain/enums/provider.enum';
import { useAppStore } from '~/usecase/store/appStore';
import ConfirmDialog from '~/components/commons/ConfirmDialog';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '~/components/ui/card';

const SettingsTab = ({ instance }: InstanceTabProps) => {
  const navigate = useNavigate();
  const renameInstance = useAppStore((s) => s.renameInstance);
  const deleteInstance = useAppStore((s) => s.deleteInstance);
  const [name, setName] = React.useState(instance.name);
  const [memory, setMemory] = React.useState(String(instance.memoryMb));
  const [javaArgs, setJavaArgs] = React.useState(instance.javaArgs ?? '');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const isMinecraft = instance.gameId === GameId.Minecraft;

  const save = () => {
    renameInstance(instance.id, name.trim() || instance.name);
    toast.success('Instance settings saved');
  };

  const remove = () => {
    deleteInstance(instance.id);
    toast.success('Instance deleted');
    navigate('/library');
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Name and launch behaviour for this instance.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inst-name">Name</Label>
            <Input value={name} id="inst-name" onChange={(e) => setName(e.target.value)} />
          </div>
          <SwitchRow defaultChecked description="Reopens when the game exits." label="Close launcher when the game starts" />
          <SwitchRow
            defaultChecked={false}
            label="Check for mod updates on launch"
            description="Only safe updates are applied automatically."
          />
        </CardContent>
      </Card>

      {isMinecraft && (
        <Card>
          <CardHeader>
            <CardTitle>Java</CardTitle>
            <CardDescription>Runtime settings. Defaults are fine for most packs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="inst-memory">Memory (MB)</Label>
              <Input
                step={512}
                min={1024}
                type="number"
                value={memory}
                id="inst-memory"
                className="w-40"
                onChange={(e) => setMemory(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="inst-java">JVM arguments</Label>
              <Textarea
                rows={2}
                id="inst-java"
                value={javaArgs}
                className="font-mono text-xs"
                onChange={(e) => setJavaArgs(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={save}>
          <Save data-icon="inline-start" />
          Save changes
        </Button>
      </div>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Deleting removes the folder, mods and saves.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 data-icon="inline-start" />
            Delete instance
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        destructive
        onConfirm={remove}
        open={confirmDelete}
        confirmLabel="Delete"
        onOpenChange={setConfirmDelete}
        title={`Delete "${instance.name}"?`}
        description="This cannot be undone."
      />
    </div>
  );
};

export const SwitchRow = ({ label, description, defaultChecked }: SwitchRowProps) => {
  const [checked, setChecked] = React.useState(defaultChecked ?? false);
  return (
    <label className="flex items-center gap-4">
      <span className="flex flex-1 flex-col">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={setChecked} />
    </label>
  );
};

export default SettingsTab;
