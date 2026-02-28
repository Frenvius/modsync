import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';
import { getCurrent } from '@tauri-apps/api/window';

class CommandService {
	async openConfigFolder() {
		const path: string = await invoke('config_folder');
		if (path) await Command.create('explorer', [path]).execute();
	}

	async openFolder(path: string) {
		if (path) await Command.create('explorer', [path]).execute();
	}

	async startGame() {
		await invoke('run_game_windows').then(async () => {
			await invoke('set_log', { window: getCurrent(), message: `-> Starting Valheim...` });
		});
	}
}

export const commandService = new CommandService();
