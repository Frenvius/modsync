import { invoke } from '@tauri-apps/api/core';

import { TmmProfile } from '~/context/AppState/types';

class ProfileService {
	async discoverTmmProfiles(): Promise<TmmProfile[]> {
		return await invoke('discover_tmm_profiles');
	}

	async getTmmBepinexPath(name: string): Promise<string> {
		return await invoke('get_tmm_bepinex_path', { name });
	}

	async createTmmProfile(name: string): Promise<TmmProfile> {
		return await invoke('create_tmm_profile', { name });
	}
}

export const profileService = new ProfileService();
