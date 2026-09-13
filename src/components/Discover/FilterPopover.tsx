import type { FilterSelectProps, FilterPopoverProps } from './types';
import type { LoaderId, ProviderId } from '~/domain/enums/provider.enum';

import { ListFilter } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { getProviderMeta } from '~/usecase/service/providers';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

import { ANY_FILTER } from './constants';

const FilterPopover = ({ game, filters, onChange, categories }: FilterPopoverProps) => {
  const activeCount =
    [filters.loader, filters.category, filters.gameVersion].filter(Boolean).length + (filters.providers.length ? 1 : 0);
  const patch = (p: Partial<FilterPopoverProps['filters']>) => onChange({ ...filters, ...p });
  const toggleProvider = (id: ProviderId, on: boolean) =>
    patch({ providers: on ? [...filters.providers, id] : filters.providers.filter((p) => p !== id) });

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
        <FilterSelect
          label="Game version"
          options={game.versions}
          value={filters.gameVersion}
          onChange={(gameVersion) => patch({ gameVersion })}
        />
        {game.loaders.length > 1 && (
          <FilterSelect
            label="Loader"
            value={filters.loader}
            options={game.loaders.map((l) => l.id)}
            onChange={(loader) => patch({ loader: loader as LoaderId | undefined })}
          />
        )}
        <FilterSelect
          label="Category"
          options={categories}
          value={filters.category}
          onChange={(category) => patch({ category })}
        />
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

const FilterSelect = ({ label, value, options, onChange }: FilterSelectProps) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select value={value ?? ANY_FILTER} onValueChange={(v) => onChange(v === ANY_FILTER ? undefined : v)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={ANY_FILTER}>Any</SelectItem>
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
