import React from 'react';
import { Check, Search } from 'lucide-react';

import { cn } from '~/lib/utils';
import { GAMES } from '~/usecase/mock/games';
import { Button } from '~/components/ui/button';
import GameIcon from '~/components/commons/GameIcon';
import { GameId, ProviderId } from '~/domain/enums/provider.enum';
import { Command, CommandItem, CommandList, CommandEmpty, CommandGroup, CommandInput, CommandDialog } from '~/components/ui/command';

interface GameStepProps {
  selected?: GameId;
  onSelect: (gameId: GameId) => void;
}

const FEATURED = [GameId.Minecraft, GameId.Valheim, GameId.VintageStory];

const GameStep = ({ selected, onSelect }: GameStepProps) => {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const thunderstoreGames = GAMES.filter((g) => g.providers.includes(ProviderId.Thunderstore));

  const pickFromList = (gameId: GameId) => {
    setPickerOpen(false);
    onSelect(gameId);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {FEATURED.map((id) => {
        const game = GAMES.find((g) => g.id === id)!;
        const active = selected === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              'group flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-accent',
              active && 'border-primary ring-2 ring-primary/30'
            )}
          >
            <GameIcon size="lg" gameId={id} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{game.name}</span>
              <span className="truncate text-xs text-muted-foreground">{game.ecosystemLabel}</span>
            </span>
            {active && <Check className="size-4 text-primary" />}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="flex items-center gap-3 rounded-lg border border-dashed bg-card/50 p-3 text-left transition-all hover:border-primary/40 hover:bg-accent"
      >
        <span className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Search className="size-5" />
        </span>
        <span className="flex flex-col">
          <span className="font-medium">Other Thunderstore game</span>
          <span className="text-xs text-muted-foreground">{thunderstoreGames.length} games supported</span>
        </span>
      </button>

      <CommandDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Choose a game" description="Thunderstore supported games">
        <Command>
          <CommandInput placeholder="Search games" />
          <CommandList>
            <CommandEmpty>No game found.</CommandEmpty>
            <CommandGroup heading="Thunderstore">
              {thunderstoreGames.map((game) => (
                <CommandItem key={game.id} value={game.name} onSelect={() => pickFromList(game.id)}>
                  <GameIcon size="sm" gameId={game.id} />
                  {game.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <div className="col-span-2 flex justify-end">
        <Button size="xs" variant="link" onClick={() => setPickerOpen(true)}>
          Browse all games
        </Button>
      </div>
    </div>
  );
};

export default GameStep;
