import { invoke } from '@tauri-apps/api/core';
import { open, Command } from '@tauri-apps/plugin-shell';

class CommandService {
	async openExternal(url: string) {
		await open(url);
	}

	async startGame() {
		await invoke('run_game_windows');
	}

	async openFolder(path: string) {
		if (path) await Command.create('explorer', [path]).execute();
	}
}

export const commandService = new CommandService();
