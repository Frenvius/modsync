import type { SharingProgress } from '~/domain/interfaces/sharing.interface';

import React from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { Link, Loader2 } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { uid } from '~/usecase/util/formatUtils';
import { useAppStore } from '~/usecase/store/appStore';
import { sharingService } from '~/usecase/service/sharing';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { Dialog, DialogTitle, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

interface JoinInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const JoinInstanceDialog = ({ open, onOpenChange }: JoinInstanceDialogProps) => {
  const navigate = useNavigate();
  const join = useAppStore((state) => state.joinSharedInstance);
  const [code, setCode] = React.useState('');
  const [progress, setProgress] = React.useState<SharingProgress>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const operationId = React.useRef<string | undefined>(undefined);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) {
      setError('Enter a share code');
      return;
    }
    setLoading(true);
    setError(undefined);
    operationId.current = uid('join');
    try {
      const instance = await join(code.trim(), operationId.current, setProgress);
      setCode('');
      setProgress(undefined);
      onOpenChange(false);
      toast.success(`Joined "${instance.name}"`);
      navigate(`/instance/${instance.id}`);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not join the shared instance'));
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!operationId.current) return;
    try {
      await sharingService.cancel(operationId.current);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not cancel synchronization'));
    }
  };

  const changeOpen = (next: boolean) => {
    if (loading) return;
    if (!next) {
      setError(undefined);
      setProgress(undefined);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link aria-hidden="true" className="size-5 text-primary" />
            Join shared instance
          </DialogTitle>
          <DialogDescription>Paste the share code from the Valheim instance owner.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-code">Share code</Label>
            <Input
              required
              value={code}
              id="join-code"
              disabled={loading}
              autoComplete="off"
              aria-invalid={Boolean(error)}
              placeholder="Paste share code"
              onChange={(event) => setCode(event.target.value)}
              aria-describedby={error ? 'join-error' : undefined}
            />
            {error && (
              <p role="alert" id="join-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
            {progress?.message ?? 'The owner must be online while the instance is copied.'}
          </p>
          <div className="flex justify-end gap-2">
            {loading && (
              <Button type="button" variant="outline" onClick={() => void cancel()}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 aria-hidden="true" data-icon="inline-start" className="animate-spin" />}
              Join instance
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default JoinInstanceDialog;
