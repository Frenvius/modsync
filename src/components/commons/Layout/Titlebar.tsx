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
  const setSelectedGame = useAppStore((s) => s.setSelectedGame);
  const selectedGame = GAMES.find((game) => game.id === selectedGameId)!;

  return (
    <header data-tauri-drag-region className="flex h-12 shrink-0 select-none items-center border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2 px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Boxes aria-hidden="true" className="size-5" strokeWidth={2} />
        </span>
        <span className="truncate text-lg font-bold tracking-tight">Forge Hub</span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 min-w-44 items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              className="mr-2 flex size-8 items-center justify-center rounded-full transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Minecraft account"
            >
              <Avatar className="size-7">
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
        <button disabled type="button" aria-label="Minimize" className="flex w-12 items-center justify-center text-muted-foreground">
          <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
        <button disabled type="button" aria-label="Maximize" className="flex w-12 items-center justify-center text-muted-foreground">
          <Square aria-hidden="true" className="size-3" strokeWidth={1.5} />
        </button>
        <button disabled type="button" aria-label="Close" className="flex w-12 items-center justify-center text-muted-foreground">
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
};

export default Titlebar;
