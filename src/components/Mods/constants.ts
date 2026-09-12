import { Ban, Link2, CircleDashed } from 'lucide-react';

import { DependencyType } from '~/domain/enums/provider.enum';

export const DEPENDENCY_TYPE_META = {
  [DependencyType.Required]: { icon: Link2, label: 'Required', className: 'bg-primary/10 text-primary' },
  [DependencyType.Optional]: { label: 'Optional', icon: CircleDashed, className: 'bg-muted text-muted-foreground' },
  [DependencyType.Incompatible]: { icon: Ban, label: 'Incompatible', className: 'bg-destructive/15 text-destructive' }
};
