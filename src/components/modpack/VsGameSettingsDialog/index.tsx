import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Check, FolderOpen, Loader2, Undo2 } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Slider } from '~/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { toast } from '~/usecase/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

interface VsGameSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modpackId: string;
}

interface VsGameSettings {
  game_path: string | null;
  min_brightness: number;
  decimal_fix_applied: boolean;
  language: string;
}

const VS_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'pt-br', label: 'Português (Brasil)' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es-es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'zh-cn', label: '中文 (简体)' },
  { value: 'zh-tw', label: '中文 (繁體)' },
  { value: 'cs', label: 'Čeština' },
  { value: 'da', label: 'Dansk' },
  { value: 'sv', label: 'Svenska' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'hu', label: 'Magyar' },
  { value: 'ro', label: 'Română' },
  { value: 'th', label: 'ไทย' },
] as const;

export function VsGameSettingsDialog({ open, onOpenChange, modpackId }: VsGameSettingsDialogProps) {
  const [settings, setSettings] = React.useState<VsGameSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [gamePath, setGamePath] = React.useState('');
  const [brightness, setBrightness] = React.useState(0);
  const [language, setLanguage] = React.useState('en');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    invoke<VsGameSettings>('get_vs_game_settings', { modpackId })
      .then((s) => {
        setSettings(s);
        setGamePath(s.game_path ?? '');
        setBrightness(s.min_brightness);
        setLanguage(s.language);
      })
      .catch((e) => toast({ title: 'Error', variant: 'destructive', description: String(e) }))
      .finally(() => setLoading(false));
  }, [open, modpackId]);

  const handleSaveGamePath = async () => {
    if (!gamePath.trim()) return;
    try {
      await invoke('set_game_path', { gameId: 'vintage-story', path: gamePath.trim() });
      toast({ title: 'Game path saved' });
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive', description: String(e) });
    }
  };

  const handleSaveBrightness = async () => {
    setSaving(true);
    try {
      await invoke('set_vs_min_brightness', { modpackId, value: brightness });
      toast({ title: 'Brightness saved', description: `minBrightness set to ${brightness.toFixed(2)}` });
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive', description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleDecimalFix = async (apply: boolean) => {
    setSaving(true);
    try {
      await invoke('apply_vs_decimal_fix', { apply });
      setSettings((prev) => prev ? { ...prev, decimal_fix_applied: apply } : prev);
      toast({
        title: apply ? 'Decimal fix applied' : 'Decimal fix reverted',
        description: apply
          ? 'Decimal separator changed to dot (.). Restart the game for changes to take effect.'
          : 'Decimal separator reverted to comma (,). Restart the game for changes to take effect.'
      });
    } catch (e) {
      toast({ title: 'Error', variant: 'destructive', description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vintage Story Settings</DialogTitle>
          <DialogDescription>Game configuration and fixes. Apply changes with the game closed.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 mt-2">
            <div className="space-y-2">
              <Label>Game Installation Path</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={gamePath}
                    className="pl-9"
                    placeholder="%appdata%\Vintagestory"
                    onChange={(e) => setGamePath(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={handleSaveGamePath}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Folder containing Vintagestory.exe
              </p>
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select
                value={language}
                onValueChange={async (value) => {
                  setLanguage(value);
                  try {
                    await invoke('set_vs_language', { modpackId, language: value });
                    toast({ title: 'Language saved', description: `Language set to ${VS_LANGUAGES.find(l => l.value === value)?.label ?? value}` });
                  } catch (e) {
                    toast({ title: 'Error', variant: 'destructive', description: String(e) });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-60">
                  {VS_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Game language (requires restart)
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Min Brightness</Label>
                  <p className="text-xs text-muted-foreground">
                    Minimum cave/night brightness ({brightness.toFixed(2)})
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleSaveBrightness} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
                </Button>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.1}
                value={[brightness]}
                onValueChange={([v]) => setBrightness(v)}
              />
            </div>

            <div className="space-y-2">
              <Label>Decimal Separator Fix</Label>
              <p className="text-xs text-muted-foreground">
                Locales that use comma as decimal separator (PT-BR, DE, FR, etc.) cause shader compilation failures and black screens when minBrightness is set.
                This fix changes Windows decimal separator to dot (.) for your user profile only — no admin required, no system-wide changes.
              </p>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); import('@tauri-apps/plugin-opener').then(m => m.openUrl('https://github.com/anegostudios/VintageStory-Issues/issues/7015')); }}
                className="text-xs text-primary hover:underline"
              >
                Related issue: VintageStory-Issues#7015
              </a>
              <div className="flex items-center gap-2 mt-2">
                {settings?.decimal_fix_applied ? (
                  <>
                    <div className="flex items-center gap-1.5 text-sm text-green-500">
                      <Check className="w-4 h-4" />
                      Fix applied
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleDecimalFix(false)} disabled={saving}>
                      <Undo2 className="w-3 h-3 mr-1.5" />
                      Revert
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 text-sm text-yellow-500">
                      <AlertTriangle className="w-4 h-4" />
                      Not applied
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleDecimalFix(true)} disabled={saving}>
                      Apply Fix
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
