import React from 'react';

import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, Minus, Square, ChevronDown } from 'lucide-react';

import GameIcon from '~/components/commons/GameIcon';
import { useAppStore } from '~/usecase/store/appStore';
import { DropdownMenu, DropdownMenuItem, DropdownMenuContent, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';

const Titlebar = () => {
  const games = useAppStore((state) => state.games);
  const selectedGameId = useAppStore((state) => state.selectedGameId);
  const desktop = isTauri();

  const closeWindow = () => void getCurrentWindow().close();
  const minimizeWindow = () => void getCurrentWindow().minimize();
  const maximizeWindow = () => void getCurrentWindow().toggleMaximize();
  const startDragging = (event: React.MouseEvent<HTMLElement>) => {
    if (
      !desktop ||
      event.button !== 0 ||
      !(event.target instanceof HTMLElement) ||
      event.target.closest('button, [role="menuitem"], input')
    )
      return;

    if (event.detail === 2) {
      void getCurrentWindow().toggleMaximize();
      return;
    }

    const onMove = () => {
      cleanup();
      void getCurrentWindow().startDragging();
    };
    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', cleanup);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', cleanup);
  };
  const setSelectedGame = useAppStore((s) => s.setSelectedGame);
  const selectedGame = games.find((game) => game.id === selectedGameId) ?? games[0];

  return (
    <header
      onMouseDown={startDragging}
      className="flex h-8 shrink-0 select-none items-center border-b border-border/50 bg-toolbar text-foreground"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <img alt="" src="/modsync.png" className="size-5 rounded" />
        <span className="truncate text-xs font-semibold">ModSync</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Select game"
            className="flex h-6 min-w-36 items-center gap-2 rounded px-2 text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GameIcon size="sm" gameId={selectedGame.id} />
            <span className="flex-1 text-left font-medium">{selectedGame.name}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {games.map((game) => (
            <DropdownMenuItem
              key={game.id}
              onClick={() => setSelectedGame(game.id)}
              className={game.id === selectedGameId ? 'bg-accent' : undefined}
            >
              <GameIcon size="sm" gameId={game.id} />
              {game.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div role="group" className="flex h-full" aria-label="Window controls">
        <button
          type="button"
          disabled={!desktop}
          aria-label="Minimize"
          onClick={minimizeWindow}
          className="flex w-9 items-center justify-center text-muted-foreground"
        >
          <Minus strokeWidth={1.5} aria-hidden="true" className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={!desktop}
          aria-label="Maximize"
          onClick={maximizeWindow}
          className="flex w-9 items-center justify-center text-muted-foreground"
        >
          <Square strokeWidth={1.5} aria-hidden="true" className="size-3" />
        </button>
        <button
          type="button"
          aria-label="Close"
          disabled={!desktop}
          onClick={closeWindow}
          className="flex w-9 items-center justify-center text-muted-foreground"
        >
          <X strokeWidth={1.5} aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </header>
  );
};

export default Titlebar;
