import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { DeviceCodeInfo, LoginDialogProps, LoginState, MinecraftAccount } from './types';

export function LoginDialog({ isOpen, onSuccess, onOpenChange }: LoginDialogProps) {
  const [state, setState] = React.useState<LoginState>('idle');
  const [deviceCode, setDeviceCode] = React.useState<null | DeviceCodeInfo>(null);
  const [error, setError] = React.useState<null | string>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && state === 'idle') {
      startLogin();
    }
    if (!isOpen) {
      setState('idle');
      setDeviceCode(null);
      setError(null);
    }
  }, [isOpen]);

  const startLogin = async () => {
    setState('requesting');
    setError(null);

    try {
      const codeInfo = await invoke<DeviceCodeInfo>('start_login');
      setDeviceCode(codeInfo);
      setState('waiting');

      await openUrl(codeInfo.verification_uri);

      pollForCompletion(codeInfo);
    } catch (err) {
      setError(err as string);
      setState('error');
    }
  };

  const pollForCompletion = async (codeInfo: DeviceCodeInfo) => {
    try {
      setState('waiting');
      const account = await invoke<MinecraftAccount>('complete_login', {
        interval: codeInfo.interval,
        deviceCode: codeInfo.device_code
      });
      setState('success');
      onSuccess(account);
      setTimeout(() => onOpenChange(false), 1500);
    } catch (err) {
      setError(err as string);
      setState('error');
    }
  };

  const copyCode = async () => {
    if (deviceCode) {
      await navigator.clipboard.writeText(deviceCode.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openBrowser = async () => {
    if (deviceCode) {
      await openUrl(deviceCode.verification_uri);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in with Microsoft</DialogTitle>
          <DialogDescription>Link your Microsoft account to play Minecraft</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-6 space-y-4">
          {state === 'requesting' && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Requesting login code...</p>
            </>
          )}

          {(state === 'waiting' || state === 'authenticating') && deviceCode && (
            <>
              <p className="text-sm text-muted-foreground text-center">Enter this code at Microsoft:</p>
              <div className="flex items-center gap-2">
                <code className="text-2xl font-mono font-bold bg-secondary px-4 py-2 rounded-lg tracking-widest">
                  {deviceCode.user_code}
                </code>
                <Button size="icon" variant="outline" onClick={copyCode} className="h-10 w-10">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button variant="outline" className="gap-2" onClick={openBrowser}>
                <ExternalLink className="w-4 h-4" />
                Open Microsoft Login
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for authorization...
              </div>
            </>
          )}

          {state === 'success' && (
            <>
              <Check className="w-12 h-12 text-green-500" />
              <p className="text-sm font-medium">Successfully signed in!</p>
            </>
          )}

          {state === 'error' && (
            <>
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button variant="outline" onClick={startLogin}>
                Try Again
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
