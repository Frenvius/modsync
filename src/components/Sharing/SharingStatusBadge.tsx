import type { Instance } from '~/domain/interfaces/instance.interface';

import React from 'react';

import { cn } from 'cn';

import { Badge } from '~/components/ui/badge';
import { sharingService } from '~/usecase/service/sharing';

interface SharingStatusBadgeProps {
  instance: Instance;
}

const OWNER_POLL_MS = 5000;
const JOINED_POLL_MS = 60000;

const SharingStatusBadge = ({ instance }: SharingStatusBadgeProps) => {
  const [online, setOnline] = React.useState<boolean>();
  const joined = instance.ownership === 'joined';
  const shareable = joined || instance.gameId === 'valheim';

  React.useEffect(() => {
    if (!shareable) return;
    let cancelled = false;
    const read = async () => {
      try {
        const value = joined
          ? await sharingService.ownerOnline(instance.id)
          : (await sharingService.status()).instanceId === instance.id;
        if (!cancelled) setOnline(value);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), joined ? JOINED_POLL_MS : OWNER_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [instance.id, joined, shareable]);

  if (!shareable || online === undefined) return null;

  const label = joined ? (online ? 'Owner online' : 'Owner offline') : online ? 'Sharing' : 'Not sharing';

  return (
    <Badge variant="outline" className={cn('gap-1.5', !online && 'text-muted-foreground')}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', online ? 'bg-primary' : 'bg-muted-foreground')} />
      {label}
    </Badge>
  );
};

export default SharingStatusBadge;
