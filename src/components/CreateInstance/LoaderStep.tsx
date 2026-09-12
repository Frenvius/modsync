import type { Game } from '~/domain/interfaces/game.interface';
import type { LoaderId } from '~/domain/enums/provider.enum';

import React from 'react';
import { Check } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';

interface LoaderStepProps {
  game: Game;
  value?: LoaderId;
  onChange: (loader: LoaderId) => void;
}

const DESCRIPTIONS: Record<string, string> = {
  vanilla: 'No mod loader. Resource packs, shaders and data packs only.',
  fabric: 'Lightweight, fast updates, best for performance and client mods.',
  forge: 'The classic loader with the largest catalog of older mods.',
  neoforge: 'Modern fork of Forge with active development.',
  quilt: 'Fabric-compatible loader with extra features.',
  bepinex: 'Unity plugin framework. Required by nearly every mod for this game.'
};

const LoaderStep = ({ game, value, onChange }: LoaderStepProps) => (
  <div className="grid grid-cols-2 gap-3">
    {game.loaders.map((loader) => (
      <button
        key={loader.id}
        type="button"
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
        <span className="text-xs text-muted-foreground">{DESCRIPTIONS[loader.id]}</span>
      </button>
    ))}
  </div>
);

export default LoaderStep;
