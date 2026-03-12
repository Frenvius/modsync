import { ChevronDown } from 'lucide-react';

import { useGame } from '~/usecase/contexts/GameContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';

export function GameSelector() {
  const { games, selectedGame, setSelectedGame } = useGame();

  if (!selectedGame || games.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/50 hover:bg-sidebar-accent transition-colors text-sm text-foreground">
          <span className="flex-1 text-left font-medium truncate">{selectedGame.display_name}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {games.map((game) => (
          <DropdownMenuItem
            key={game.id}
            onClick={() => setSelectedGame(game)}
            className={`cursor-pointer ${selectedGame.id === game.id ? 'bg-accent' : ''}`}
          >
            {game.display_name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
