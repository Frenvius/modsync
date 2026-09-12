import type { VersionStepProps } from './types';

import React from 'react';

import { Check } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Badge } from '~/components/ui/badge';
import SearchBar from '~/components/commons/SearchBar';

const VersionStep = ({ game, value, onChange }: VersionStepProps) => {
  const [query, setQuery] = React.useState('');
  const versions = game.versions.filter((v) => v.includes(query));

  return (
    <div className="flex flex-col gap-3">
      <SearchBar value={query} onChange={setQuery} placeholder={`Filter ${game.name} versions`} />
      <ul className="flex flex-col gap-1">
        {versions.map((version, i) => (
          <li key={version}>
            <button
              type="button"
              onClick={() => onChange(version)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                value === version && 'border-primary/40 bg-primary/5'
              )}
            >
              <span className="font-mono">{version}</span>
              {i === 0 && <Badge variant="secondary">Latest</Badge>}
              <span className="flex-1" />
              {value === version && <Check className="size-4 text-primary" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VersionStep;
