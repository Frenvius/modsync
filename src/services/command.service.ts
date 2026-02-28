import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';

class CommandService {
	async startGame() {
		await invoke('run_game_windows');
	}

	async openFolder(path: string) {
		if (path) await Command.create('explorer', [path]).execute();
	}
}

export const commandService = new CommandService();
