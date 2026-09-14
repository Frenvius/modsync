import React from 'react';

import { Loader2 } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Dialog, DialogTitle, DialogFooter, DialogHeader, DialogContent, DialogDescription } from '~/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

const ConfirmDialog = ({
  open,
  title,
  onConfirm,
  description,
  destructive,
  onOpenChange,
  confirmLabel = 'Confirm'
}: ConfirmDialogProps) => {
  const [pending, setPending] = React.useState(false);

  const changeOpen = (nextOpen: boolean) => {
    if (!pending) onOpenChange(nextOpen);
  };

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      setPending(false);
      onOpenChange(false);
    } catch {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent aria-busy={pending} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void confirm()} variant={destructive ? 'destructive' : 'default'}>
            {pending && <Loader2 className="animate-spin motion-reduce:animate-none" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmDialog;
