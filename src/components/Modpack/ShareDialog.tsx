import type { ShareDialogProps } from './types';
import type { ShareLink } from '~/domain/interfaces/modpack.interface';

import React from 'react';

import { toast } from 'sonner';
import { Copy, Check, QrCode, Loader2 } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { modpackService } from '~/usecase/service/modpack';
import { Dialog, DialogTitle, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

const ShareDialog = ({ modpack, onOpenChange }: ShareDialogProps) => {
  const [link, setLink] = React.useState<null | ShareLink>(null);
  const [copied, setCopied] = React.useState<null | 'url' | 'code'>(null);

  React.useEffect(() => {
    setLink(null);
    setCopied(null);
    if (modpack) void modpackService.share(modpack).then(setLink);
  }, [modpack?.id]);

  const copy = async (kind: 'url' | 'code') => {
    if (!link) return;
    await navigator.clipboard.writeText(kind === 'url' ? link.url : link.code).catch(() => undefined);
    setCopied(kind);
    toast.success(kind === 'url' ? 'Link copied' : 'Share code copied');
  };

  return (
    <Dialog open={modpack !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite friends</DialogTitle>
          <DialogDescription>
            Anyone with the link or code can install "{modpack?.name}" with the exact same mods.
          </DialogDescription>
        </DialogHeader>
        {!link ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Share link</span>
              <div className="flex gap-2">
                <Input readOnly value={link.url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="outline" onClick={() => copy('url')}>
                  {copied === 'url' ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  Copy
                </Button>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Share code</span>
                <button
                  type="button"
                  onClick={() => copy('code')}
                  className="flex h-14 items-center justify-center rounded-md border bg-muted/40 font-mono text-2xl font-semibold tracking-[0.2em] transition-colors hover:bg-muted"
                >
                  {link.code}
                </button>
                <span className="text-[11px] text-muted-foreground">Friends paste this in Modpacks, then Import.</span>
              </div>
              <div className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 text-muted-foreground">
                <QrCode className="size-8" />
                <span className="text-[10px]">QR code</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;
