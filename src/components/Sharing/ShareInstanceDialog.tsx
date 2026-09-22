import type { Instance } from '~/domain/interfaces/instance.interface';
import type { SharingStatus } from '~/domain/interfaces/sharing.interface';

import React from 'react';

import { toast } from 'sonner';
import { Copy, Check, Radio, Loader2, RadioTower } from 'lucide-react';

import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { sharingService } from '~/usecase/service/sharing';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { Dialog, DialogTitle, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

interface ShareInstanceDialogProps {
  open: boolean;
  instance: Instance;
  onOpenChange: (open: boolean) => void;
}

const ShareInstanceDialog = ({ open, instance, onOpenChange }: ShareInstanceDialogProps) => {
  const [status, setStatus] = React.useState<SharingStatus>({ active: false });
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    void sharingService
      .status()
      .then(setStatus)
      .catch((error) => toast.error(getErrorMessage(error, 'Could not read sharing status')));
  }, [open]);

  const start = async () => {
    setLoading(true);
    try {
      setStatus(await sharingService.start(instance.id));
      toast.success('Sharing started');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not start sharing'));
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    setLoading(true);
    try {
      await sharingService.stop(instance.id);
      setStatus({ active: false });
      toast.success('Sharing stopped');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not stop sharing'));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!status.code) return;
    await navigator.clipboard.writeText(status.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    toast.success('Share code copied');
  };

  const sharingThisInstance = status.active && status.instanceId === instance.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RadioTower aria-hidden="true" className="size-5 text-primary" />
            Share {instance.name}
          </DialogTitle>
          <DialogDescription>Friends receive an exact, passive copy while this app remains online.</DialogDescription>
        </DialogHeader>

        {sharingThisInstance && status.code ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="share-code">Share code</Label>
              <div className="flex items-start gap-2">
                <output id="share-code" className="min-w-0 flex-1 break-all rounded-md border bg-muted p-3 font-mono text-xs">
                  {status.code}
                </output>
                <Button size="icon" variant="outline" onClick={() => void copy()} aria-label="Copy share code">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </Button>
              </div>
            </div>
            <p role="status" className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
              Sharing is active. Keep ModSync open while friends join or synchronize.
            </p>
            <Button variant="outline" disabled={loading} onClick={() => void stop()}>
              {loading && <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin" />}
              Stop sharing
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {status.active && (
              <p role="status" className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                Another instance is currently being shared. Stop it before sharing this instance.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              The code stays linked to this instance. Stopping sharing takes it offline without changing the code.
            </p>
            <Button onClick={() => void start()} disabled={loading || status.active}>
              {loading ? (
                <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin" />
              ) : (
                <Radio aria-hidden="true" data-icon="inline-start" />
              )}
              Start sharing
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ShareInstanceDialog;
