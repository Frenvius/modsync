import React from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useNavigate } from 'react-router-dom';
import { Boxes, ChevronDown, LogOut, Minus, Settings, Square, User, X } from 'lucide-react';

import { USER } from '~/usecase/mock/settings';
import { GAMES } from '~/usecase/mock/games';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { GameId } from '~/domain/enums/provider.enum';
import { useAppStore } from '~/usecase/store/appStore';
import GameIcon from '~/components/commons/GameIcon';
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
    if (!desktop || event.button !== 0 || !(event.target instanceof HTMLElement) || event.target.closest('button, [role="menuitem"], input')) return;

    if (event.detail === 2) {
      void getCurrentWindow().toggleMaximize();
      return;
    }

    let onMove: () => void;
    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', cleanup);
    };
    onMove = () => {
      cleanup();
      void getCurrentWindow().startDragging();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', cleanup);
  };
  const setSelectedGame = useAppStore((s) => s.setSelectedGame);
  const selectedGame = GAMES.find((game) => game.id === selectedGameId)!;

  return (
    <header onMouseDown={startDragging} className="flex h-8 shrink-0 select-none items-center border-b border-border/50 bg-toolbar text-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
        <span className="flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
          <Boxes aria-hidden="true" className="size-3.5" strokeWidth={2} />
        </span>
        <span className="truncate text-xs font-semibold">Forge Hub</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-6 min-w-36 items-center gap-2 rounded px-2 text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Select game"
          >
            <GameIcon size="sm" gameId={selectedGame.id} />
            <span className="flex-1 text-left font-medium">{selectedGame.name}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {GAMES.map((game) => (
            <DropdownMenuItem key={game.id} className={game.id === selectedGameId ? 'bg-accent' : undefined} onClick={() => setSelectedGame(game.id)}>
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
              className="mr-1 flex size-6 items-center justify-center rounded transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Minecraft account"
            >
              <Avatar className="size-5">
                <AvatarFallback style={{ background: USER.avatarColor }} className="text-[11px] font-semibold text-primary-foreground">
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
        <button disabled={!desktop} type="button" aria-label="Minimize" onClick={minimizeWindow} className="flex w-9 items-center justify-center text-muted-foreground">
          <Minus aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
        <button disabled={!desktop} type="button" aria-label="Maximize" onClick={maximizeWindow} className="flex w-9 items-center justify-center text-muted-foreground">
          <Square aria-hidden="true" className="size-3" strokeWidth={1.5} />
        </button>
        <button disabled={!desktop} type="button" aria-label="Close" onClick={closeWindow} className="flex w-9 items-center justify-center text-muted-foreground">
          <X aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
};

export default Titlebar;
