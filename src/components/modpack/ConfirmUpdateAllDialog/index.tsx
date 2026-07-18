import { ArrowRight, Download, Package } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import { getIconSrc } from '~/usecase/util/pathUtils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';

import { ConfirmUpdateAllDialogProps } from './types';

export function ConfirmUpdateAllDialog({ open, updates, onConfirm, onOpenChange }: ConfirmUpdateAllDialogProps) {
  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update {updates.length} mod{updates.length !== 1 ? 's' : ''}?</DialogTitle>
          <DialogDescription>The following mods will be updated to their latest versions.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[360px] -mx-1 px-1">
          <div className="space-y-1">
            {updates.map((item) => (
              <div key={item.slug} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                {item.iconUrl ? (
                  <img
                    src={getIconSrc(item.iconUrl)}
                    alt=""
                    className="w-8 h-8 rounded object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{item.currentVersion}</span>
                    <ArrowRight className="w-3 h-3 shrink-0 text-primary" />
                    <span className="truncate text-primary font-medium">{item.newVersion}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="glow" onClick={handleConfirm} className="gap-2">
            <Download className="w-4 h-4" />
            Update All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
