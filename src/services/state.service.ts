import { invoke } from '@tauri-apps/api/core';
import { getCurrent } from '@tauri-apps/api/window';

class StateService {
	dispatch = async (type: string, payload: any) => {
		await invoke(type, { message: payload, window: getCurrent() });
	};

	setUpdating = async () => {
		await this.dispatch('set_log', '-> Syncing mods...');
		await this.dispatch('play_locked', true);
		await this.dispatch('play_text', 'Syncing');
	};

	setUninstalling = async () => {
		await this.dispatch('set_log', '-> Removing old files');
		await this.dispatch('play_locked', true);
		await this.dispatch('play_text', 'Uninstalling');
	};

	setReady = async (showMessage: boolean) => {
		await this.dispatch('play_locked', false);
		await this.dispatch('play_text', 'Play');
		await this.dispatch('status_text', 'Ready to play');
		showMessage && (await this.dispatch('set_log', '-> Running latest mods'));
	};

	setNotInstalled = async () => {
		await this.dispatch('play_locked', false);
		await this.dispatch('play_text', 'Setup');
		await this.dispatch('status_text', 'Not installed');
		await this.dispatch('needs_update', false);
		await this.dispatch('set_log', '-> Click Share to host, or Join to sync with friends');
	};

	setUninstalled = async () => {
		await this.dispatch('needs_update', false);
		await this.dispatch('play_locked', false);
		await this.dispatch('play_text', 'Setup');
		await this.dispatch('status_text', 'Uninstalled!');
		await this.dispatch('set_log', '-> Old files removed!');
		await this.dispatch('sync_progress', 0);
	};

	setInstalled = async () => {
		await this.dispatch('needs_update', false);
		await this.dispatch('play_text', 'Play');
		await this.dispatch('play_locked', false);
		await this.dispatch('progress_type', 'determinate');
		await this.dispatch('sync_progress', 0);
		await this.dispatch('status_text', 'Done!');
		await this.dispatch('set_log', '-> Mods installed!');
		await this.dispatch('set_log', '-> Ready to play!');
	};
}

export const stateService = new StateService();
