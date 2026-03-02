import React from 'react';
import { Gamepad2 } from 'lucide-react';
import { Select, SelectItem, SelectValue, SelectContent, SelectTrigger } from '@/components/ui/select';

import { AppStateContext } from '~/context/AppState/constants';
import { GameInfo, gameService } from '~/services/game.service';

const GameSelector: React.FC = () => {
	const { activeGame, setActiveGame } = React.useContext(AppStateContext);
	const [games, setGames] = React.useState<GameInfo[]>([]);

	React.useEffect(() => {
		gameService.getGames().then((loadedGames) => {
			setGames(loadedGames);
			if (!activeGame && loadedGames.length > 0) {
				handleGameChange(loadedGames[0].id);
			}
		}).catch(console.error);
	}, []);

	const handleGameChange = (gameId: string) => {
		setActiveGame(gameId);
	};

	const selectedGame = games.find((g) => g.id === activeGame);

	if (games.length === 0) {
		return null;
	}

	return (
		<div className="px-3 py-2">
			<Select value={activeGame} onValueChange={handleGameChange}>
				<SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border">
					<div className="flex items-center gap-2">
						<Gamepad2 className="h-4 w-4" />
						<SelectValue placeholder="Select game">{selectedGame?.name || 'Select game'}</SelectValue>
					</div>
				</SelectTrigger>
				<SelectContent>
					{games.map((game) => (
						<SelectItem key={game.id} value={game.id}>
							{game.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
};

export default GameSelector;
