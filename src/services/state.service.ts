import { invoke } from '@tauri-apps/api/core';
import { getCurrent } from '@tauri-apps/api/window';

class StateService {
	dispatch = async (type: string, payload: any) => {
		await invoke(type, { message: payload, window: getCurrent() });
	};

	setUpdating = async () => {
		await this.dispatch('play_locked', true);
		await this.dispatch('play_text', 'Syncing');
	};

	setReady = async () => {
		await this.dispatch('play_locked', false);
		await this.dispatch('play_text', 'Play');
		await this.dispatch('status_text', 'Ready to play');
	};

	setInstalled = async () => {
		await this.dispatch('needs_update', false);
		await this.dispatch('play_text', 'Play');
		await this.dispatch('play_locked', false);
		await this.dispatch('progress_type', 'determinate');
		await this.dispatch('sync_progress', 0);
		await this.dispatch('status_text', 'Done!');
	};
}

export const stateService = new StateService();
