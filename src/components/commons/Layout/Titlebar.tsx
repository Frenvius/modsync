import React from 'react';
import { useNavigate } from 'react-router-dom';

import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X, User, Boxes, Minus, LogOut, Square, Settings, ChevronDown } from 'lucide-react';

import { GAMES } from '~/usecase/mock/games';
import { USER } from '~/usecase/mock/settings';
import GameIcon from '~/components/commons/GameIcon';
import { GameId } from '~/domain/enums/provider.enum';
import { useAppStore } from '~/usecase/store/appStore';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '~/components/ui/dropdown-menu';

const Titlebar = () => {
  const navigate = useNavigate();
  const selectedGameId = useAppStore((s) => s.selectedGameId);
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
  const selectedGame = GAMES.find((game) => game.id === selectedGameId)!;

  return (
    <header
      onMouseDown={startDragging}
      className="flex h-8 shrink-0 select-none items-center border-b border-border/50 bg-toolbar text-foreground"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <span className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
          <Boxes strokeWidth={2} aria-hidden="true" className="size-3.5" />
        </span>
        <span className="truncate text-xs font-semibold">Forge Hub</span>
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
          {GAMES.map((game) => (
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

      {selectedGameId === GameId.Minecraft && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Minecraft account"
              className="mr-1 flex size-6 items-center justify-center rounded transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Avatar className="size-5">
                <AvatarFallback
                  style={{ background: USER.avatarColor }}
                  className="text-[11px] font-semibold text-primary-foreground"
                >
                  {USER.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{USER.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/settings?section=accounts')}>
                <User />
                Accounts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive">
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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
