import type { LoaderStepProps } from './types';

import { Check } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';

import { LOADER_DESCRIPTIONS } from './constants';

const LoaderStep = ({ game, value, onChange }: LoaderStepProps) => (
  <div className="grid grid-cols-2 gap-3">
    {game.loaders.map((loader) => (
      <button
        type="button"
        key={loader.id}
        onClick={() => onChange(loader.id)}
        className={cn(
          'flex flex-col gap-1 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-accent',
          value === loader.id && 'border-primary ring-2 ring-primary/30'
        )}
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">{loader.name}</span>
          {loader.recommended && <Badge className="bg-primary/10 text-primary">Recommended</Badge>}
          <span className="flex-1" />
          {value === loader.id && <Check className="size-4 text-primary" />}
        </span>
        <span className="text-xs text-muted-foreground">{LOADER_DESCRIPTIONS[loader.id]}</span>
      </button>
    ))}
  </div>
);

export default LoaderStep;
