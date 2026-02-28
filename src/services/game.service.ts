import { invoke } from '@tauri-apps/api/core';

export interface GameInfo {
	id: string;
	name: string;
	steam_id: number;
	thunderstore_id: string;
}

class GameService {
	async getGames(): Promise<GameInfo[]> {
		return invoke<GameInfo[]>('get_games');
	}

	async getGame(id: string): Promise<null | GameInfo> {
		return invoke<null | GameInfo>('get_game', { id });
	}
}

export const gameService = new GameService();
