import React from 'react';

import { invoke } from '@tauri-apps/api/core';

export interface GameInfo {
  id: string;
  display_name: string;
  requires_loader: boolean;
  mod_source: string;
  thunderstore_community: string | null;
  default_version: string | null;
  bepinex_package: string | null;
  profile_type: string | null;
}

interface GameContextType {
  games: GameInfo[];
  selectedGame: GameInfo | null;
  setSelectedGame: (game: GameInfo) => void;
  isLoading: boolean;
}

const GameContext = React.createContext<GameContextType>({
  games: [],
  selectedGame: null,
  setSelectedGame: () => {},
  isLoading: true
});

const STORAGE_KEY = 'modpack-sync:selected-game';

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = React.useState<GameInfo[]>([]);
  const [selectedGame, setSelectedGameState] = React.useState<GameInfo | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadGames = async () => {
      try {
        const result = await invoke<GameInfo[]>('list_games');
        setGames(result);

        const savedGameId = localStorage.getItem(STORAGE_KEY);
        const saved = savedGameId ? result.find((g) => g.id === savedGameId) : null;
        setSelectedGameState(saved ?? result[0] ?? null);
      } catch (err) {
        console.error('Failed to load games:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadGames();
  }, []);

  React.useEffect(() => {
    if (selectedGame?.mod_source === 'thunderstore') {
      invoke('warm_thunderstore_cache', { gameId: selectedGame.id }).catch(() => {});
    }
  }, [selectedGame?.id]);

  const setSelectedGame = React.useCallback((game: GameInfo) => {
    setSelectedGameState(game);
    localStorage.setItem(STORAGE_KEY, game.id);
  }, []);

  const value = React.useMemo(
    () => ({ games, selectedGame, setSelectedGame, isLoading }),
    [games, selectedGame, setSelectedGame, isLoading]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  return React.useContext(GameContext);
}
