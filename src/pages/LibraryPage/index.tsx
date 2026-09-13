import type { GameId } from '~/domain/enums/provider.enum';
import type { LibraryView, LibrarySortKey } from './types';

import React from 'react';

import { Plus, List, Library, LayoutGrid } from 'lucide-react';

import { Button } from '~/components/ui/button';
import GameIcon from '~/components/commons/GameIcon';
import { useAppStore } from '~/usecase/store/appStore';
import SearchBar from '~/components/commons/SearchBar';
import EmptyState from '~/components/commons/EmptyState';
import PageHeader from '~/components/commons/PageHeader';
import InstanceCard from '~/components/Instance/InstanceCard';
import InstanceListItem from '~/components/Instance/InstanceListItem';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { Select, SelectItem, SelectGroup, SelectValue, SelectContent, SelectTrigger } from '~/components/ui/select';

import { ALL_GAMES, LIBRARY_SORT_LABELS } from './constants';

const LibraryPage = () => {
  const games = useAppStore((state) => state.games);
  const instances = useAppStore((state) => state.instances);
  const openCreate = useAppStore((s) => s.setCreateInstanceOpen);
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState<LibraryView>('grid');
  const [sort, setSort] = React.useState<LibrarySortKey>('lastPlayed');
  const [game, setGame] = React.useState<string>(ALL_GAMES);

  const visible = instances
    .filter((i) => game === ALL_GAMES || i.gameId === game)
    .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'game') return a.gameId.localeCompare(b.gameId) || a.name.localeCompare(b.name);
      if (sort === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
      return (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? '');
    });

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title="Library"
        description={`${instances.length} instances across ${new Set(instances.map((i) => i.gameId)).size} games.`}
      >
        <Button onClick={() => openCreate(true)}>
          <Plus data-icon="inline-start" />
          Create instance
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={query} className="w-64" onChange={setQuery} placeholder="Search instances" />
        <Select value={game} onValueChange={(v) => setGame(v as GameId | typeof ALL_GAMES)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_GAMES}>All games</SelectItem>
              {games.map((game) => (
                <SelectItem key={game.id} value={game.id}>
                  <GameIcon size="sm" gameId={game.id} />
                  {game.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as LibrarySortKey)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(Object.keys(LIBRARY_SORT_LABELS) as Array<LibrarySortKey>).map((k) => (
                <SelectItem key={k} value={k}>
                  Sort: {LIBRARY_SORT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="flex-1" />
        <ToggleGroup value={view} type="single" variant="outline" onValueChange={(v) => v && setView(v as LibraryView)}>
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <LayoutGrid />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No instances"
          description={query ? 'Nothing matches your search.' : 'Create your first instance to get started.'}
        >
          <Button onClick={() => openCreate(true)}>
            <Plus data-icon="inline-start" />
            Create instance
          </Button>
        </EmptyState>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {visible.map((i) => (
            <InstanceCard key={i.id} instance={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 rounded-lg border bg-card/40 p-1">
          {visible.map((i) => (
            <InstanceListItem key={i.id} instance={i} />
          ))}
        </div>
      )}
    </div>
  );
};

export default LibraryPage;
