import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { Check, Coffee, Download, ExternalLink, HardDrive, Loader2, Monitor, RefreshCw, Share2, Wifi, WifiOff } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { toast } from '~/usecase/hooks/use-toast';
import { Separator } from '~/components/ui/separator';
import { AppLayout } from '~/components/layout/AppLayout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

import { AppSettings, JavaRuntime } from './types';

export default function SettingsPage() {
  const [javaInstallations, setJavaInstallations] = React.useState<JavaRuntime[]>([]);
  const [loadingJava, setLoadingJava] = React.useState(true);
  const [settings, setSettings] = React.useState<AppSettings>({
    java_path: null,
    memory_max: '4G',
    memory_min: '512M'
  });
  const [saving, setSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);

  React.useEffect(() => {
    loadJavaInstallations();
    loadSettings();
  }, []);

  const loadJavaInstallations = async () => {
    setLoadingJava(true);
    try {
      const javas = await invoke<JavaRuntime[]>('find_all_java');
      setJavaInstallations(javas);
    } catch (err) {
      console.error('Failed to find Java installations:', err);
    } finally {
      setLoadingJava(false);
    }
  };

  const loadSettings = async () => {
    try {
      const loaded = await invoke<AppSettings>('get_settings');
      setSettings({
        java_path: loaded.java_path,
        memory_max: loaded.memory_max || '4G',
        memory_min: loaded.memory_min || '512M'
      });
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('save_settings', { settings });
      setHasChanges(false);
      toast({
        title: 'Settings saved',
        description: 'Your settings have been saved successfully.'
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast({
        title: 'Error',
        variant: 'destructive',
        description: 'Failed to save settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const getJavaMajorVersion = (version: string): number => {
    const v = version.replace(/^1\./, '');
    const match = v.match(/^(\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  const isJavaCompatible = (version: string): boolean => {
    const major = getJavaMajorVersion(version);
    return major >= 17;
  };

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your mod manager preferences</p>
        </div>
        <Tabs className="space-y-6" defaultValue="general">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="general" className="gap-2">
              <Monitor className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="java" className="gap-2">
              <Coffee className="w-4 h-4" />
              Java
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Sync
            </TabsTrigger>
            <TabsTrigger value="storage" className="gap-2">
              <HardDrive className="w-4 h-4" />
              Storage
            </TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="space-y-6">
            <div className="p-6 bg-card border border-border rounded-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Appearance</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Theme</Label>
                      <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
                    </div>
                    <Select defaultValue="dark">
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Animations</Label>
                      <p className="text-sm text-muted-foreground">Enable smooth transitions and effects</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Minecraft</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Minecraft Directory</Label>
                    <div className="flex gap-2">
                      <Input readOnly className="bg-secondary" value="C:/Users/Player/AppData/Roaming/.minecraft" />
                      <Button variant="outline">Browse</Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Default Mod Loader</Label>
                      <p className="text-sm text-muted-foreground">Used when creating new modpacks</p>
                    </div>
                    <Select defaultValue="fabric">
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fabric">Fabric</SelectItem>
                        <SelectItem value="forge">Forge</SelectItem>
                        <SelectItem value="quilt">Quilt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="java" className="space-y-6">
            <div className="p-6 bg-card border border-border rounded-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Java Installation</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Java Runtime</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Select which Java installation to use for launching Minecraft. Java 17+ is required for modern Minecraft versions.
                    </p>
                    {loadingJava ? (
                      <div className="flex items-center gap-2 text-muted-foreground py-4">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Detecting Java installations...
                      </div>
                    ) : javaInstallations.length === 0 ? (
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                        <p className="text-sm text-destructive font-medium">No Java installations found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Please install Java 17 or later from{' '}
                          <a target="_blank" rel="noopener noreferrer" href="https://adoptium.net" className="text-primary hover:underline">
                            adoptium.net
                          </a>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div
                          onClick={() => updateSetting('java_path', null)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            !settings.java_path ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              !settings.java_path ? 'border-primary' : 'border-muted-foreground'
                            }`}
                          >
                            {!settings.java_path && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">Auto-detect (Recommended)</p>
                            <p className="text-sm text-muted-foreground">Automatically use the best available Java version</p>
                          </div>
                        </div>
                        {javaInstallations.map((java) => {
                          const isCompatible = isJavaCompatible(java.version);
                          const isSelected = settings.java_path === java.path;
                          const majorVersion = getJavaMajorVersion(java.version);

                          return (
                            <div
                              key={java.path}
                              onClick={() => updateSetting('java_path', java.path)}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  isSelected ? 'border-primary' : 'border-muted-foreground'
                                }`}
                              >
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">Java {majorVersion}</p>
                                  {isCompatible ? (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">Compatible</span>
                                  ) : (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500">Outdated</span>
                                  )}
                                </div>
                                <p title={java.path} className="text-xs text-muted-foreground truncate">
                                  {java.path}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button size="sm" variant="outline" className="mt-2 gap-2" disabled={loadingJava} onClick={loadJavaInstallations}>
                      {loadingJava ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Memory Allocation</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Minimum Memory</Label>
                      <p className="text-sm text-muted-foreground">Initial memory allocation</p>
                    </div>
                    <Select value={settings.memory_min || '512M'} onValueChange={(v) => updateSetting('memory_min', v)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="512M">512 MB</SelectItem>
                        <SelectItem value="1G">1 GB</SelectItem>
                        <SelectItem value="2G">2 GB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Maximum Memory</Label>
                      <p className="text-sm text-muted-foreground">Maximum memory allocation</p>
                    </div>
                    <Select value={settings.memory_max || '4G'} onValueChange={(v) => updateSetting('memory_max', v)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2G">2 GB</SelectItem>
                        <SelectItem value="4G">4 GB</SelectItem>
                        <SelectItem value="6G">6 GB</SelectItem>
                        <SelectItem value="8G">8 GB</SelectItem>
                        <SelectItem value="12G">12 GB</SelectItem>
                        <SelectItem value="16G">16 GB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                    <p>For most modpacks, 4-6 GB is recommended. Heavy modpacks with 100+ mods may need 8 GB or more.</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="sync" className="space-y-6">
            <div className="p-6 bg-card border border-border rounded-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Sync Preferences</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-sync</Label>
                      <p className="text-sm text-muted-foreground">Automatically sync when changes are detected</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Sync Interval</Label>
                      <p className="text-sm text-muted-foreground">How often to check for updates</p>
                    </div>
                    <Select defaultValue="5">
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Every 1 minute</SelectItem>
                        <SelectItem value="5">Every 5 minutes</SelectItem>
                        <SelectItem value="15">Every 15 minutes</SelectItem>
                        <SelectItem value="30">Every 30 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Sync Configs</Label>
                      <p className="text-sm text-muted-foreground">Include mod configurations in sync</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Sync Resource Packs</Label>
                      <p className="text-sm text-muted-foreground">Include resource packs in sync</p>
                    </div>
                    <Switch />
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Offline Mode</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Wifi className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <Label>Connection Status</Label>
                        <p className="text-sm text-success">Connected</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-2">
                      <WifiOff className="w-4 h-4" />
                      Go Offline
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Queue Offline Changes</Label>
                      <p className="text-sm text-muted-foreground">Save changes to sync when back online</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Share2 className="w-5 h-5" />
                  P2P Sharing
                </h3>
                <div className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                    <p>
                      Share modpacks directly with friends using peer-to-peer connections. You must be online for friends to sync, and port
                      forwarding is required.
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Default Share Port</Label>
                      <p className="text-sm text-muted-foreground">Port used when sharing modpacks</p>
                    </div>
                    <Input min={1} max={65535} type="number" defaultValue="7878" className="w-24 text-center" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Find Your Public IP</Label>
                      <p className="text-sm text-muted-foreground">Required for friends to connect to you</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => window.open('https://whatismyipaddress.com/', '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                      whatismyipaddress.com
                    </Button>
                  </div>
                  <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
                    <p className="font-medium text-warning mb-1">Port Forwarding Required</p>
                    <p className="text-muted-foreground">
                      To share modpacks, you need to forward the share port on your router to your computer's local IP. Search "port
                      forwarding [your router brand]" for instructions.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="storage" className="space-y-6">
            <div className="p-6 bg-card border border-border rounded-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Storage Management</h3>
                <div className="p-4 bg-secondary rounded-lg mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Storage Used</span>
                    <span className="text-sm text-muted-foreground">8.4 GB / 50 GB</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div style={{ width: '16.8%' }} className="h-full bg-primary rounded-full" />
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <span className="text-muted-foreground">Mods (5.2 GB)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-warning" />
                      <span className="text-muted-foreground">Configs (1.1 GB)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-success" />
                      <span className="text-muted-foreground">Cache (2.1 GB)</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Download Location</Label>
                    <div className="flex gap-2">
                      <Input readOnly className="bg-secondary" value="C:/Users/Player/ModSync/Downloads" />
                      <Button variant="outline">Browse</Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-clear Cache</Label>
                      <p className="text-sm text-muted-foreground">Remove unused cached files automatically</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="gap-2">
                      <Download className="w-4 h-4" />
                      Clear Cache (2.1 GB)
                    </Button>
                    <Button variant="outline" className="gap-2">
                      Remove Unused Mods
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-3">
          <Button variant="outline">Reset to Defaults</Button>
          <Button variant="glow" className="gap-2" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : hasChanges ? (
              'Save Changes'
            ) : (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            )}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
