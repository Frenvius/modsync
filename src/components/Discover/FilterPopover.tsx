import type { Game } from '~/domain/interfaces/game.interface';
import type { LoaderId, ProviderId } from '~/domain/enums/provider.enum';

import React from 'react';
import { ListFilter } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { getProviderMeta } from '~/usecase/service/providers';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

export interface DiscoverFilters {
  loader?: LoaderId;
  category?: string;
  gameVersion?: string;
  providers: Array<ProviderId>;
}

interface FilterPopoverProps {
  game: Game;
  filters: DiscoverFilters;
  categories: Array<string>;
  onChange: (filters: DiscoverFilters) => void;
}

const ANY = '__any';

const FilterPopover = ({ game, filters, categories, onChange }: FilterPopoverProps) => {
  const activeCount = [filters.loader, filters.category, filters.gameVersion].filter(Boolean).length + (filters.providers.length ? 1 : 0);
  const patch = (p: Partial<DiscoverFilters>) => onChange({ ...filters, ...p });
  const toggleProvider = (id: ProviderId, on: boolean) => patch({ providers: on ? [...filters.providers, id] : filters.providers.filter((p) => p !== id) });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <ListFilter data-icon="inline-start" />
          Filters
          {activeCount > 0 && <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px]">{activeCount}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-4">
        <FilterSelect label="Game version" value={filters.gameVersion} options={game.versions} onChange={(gameVersion) => patch({ gameVersion })} />
        {game.loaders.length > 1 && (
          <FilterSelect
            label="Loader"
            value={filters.loader}
            options={game.loaders.map((l) => l.id)}
            onChange={(loader) => patch({ loader: loader as LoaderId | undefined })}
          />
        )}
        <FilterSelect label="Category" value={filters.category} options={categories} onChange={(category) => patch({ category })} />
        {game.providers.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Providers</legend>
            {game.providers.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={filters.providers.includes(id)} onCheckedChange={(v) => toggleProvider(id, v === true)} />
                <span className="size-2 rounded-full" style={{ background: getProviderMeta(id).color }} />
                {getProviderMeta(id).name}
              </label>
            ))}
          </fieldset>
        )}
        <Button size="sm" variant="ghost" className="self-end" onClick={() => onChange({ providers: [] })}>
          Reset
        </Button>
      </PopoverContent>
    </Popover>
  );
};

interface FilterSelectProps {
  label: string;
  value?: string;
  options: Array<string>;
  onChange: (value: string | undefined) => void;
}

const FilterSelect = ({ label, value, options, onChange }: FilterSelectProps) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={ANY}>Any</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="capitalize">
              {o}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

export default FilterPopover;
