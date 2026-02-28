import { invoke } from '@tauri-apps/api/core';

import { TmmProfile } from '~/context/AppState/types';
import { Profile, ProfileSummary, TmmProfileInfo } from '~/types/profile';

class ProfileService {
	async discoverTmmProfiles(): Promise<TmmProfile[]> {
		return await invoke('discover_tmm_profiles');
	}

	async getProfile(profileId: string): Promise<Profile> {
		return await invoke('get_profile', { profileId });
	}

	async deleteProfile(profileId: string): Promise<void> {
		return await invoke('delete_profile', { profileId });
	}

	async getProfiles(gameId: string): Promise<ProfileSummary[]> {
		return await invoke('get_profiles', { gameId });
	}

	async getTmmBepinexPath(name: string): Promise<string> {
		return await invoke('get_tmm_bepinex_path', { name });
	}

	async createTmmProfile(name: string): Promise<TmmProfile> {
		return await invoke('create_tmm_profile', { name });
	}

	async getActiveProfile(gameId: string): Promise<null | Profile> {
		return await invoke('get_active_profile', { gameId });
	}

	async getActiveBepinexPath(gameId: string): Promise<string> {
		return await invoke('get_active_bepinex_path', { gameId });
	}

	async createProfile(gameId: string, name: string): Promise<Profile> {
		return await invoke('create_profile', { name, gameId });
	}

	async renameProfile(profileId: string, newName: string): Promise<Profile> {
		return await invoke('rename_profile', { newName, profileId });
	}

	async setActiveProfile(gameId: string, profileId: string): Promise<void> {
		return await invoke('set_active_profile', { gameId, profileId });
	}

	async duplicateProfile(profileId: string, newName: string): Promise<Profile> {
		return await invoke('duplicate_profile', { newName, profileId });
	}

	async discoverTmmProfilesForImport(gameId: string): Promise<TmmProfileInfo[]> {
		return await invoke('discover_tmm_profiles_for_import', { gameId });
	}

	async importFromTmm(gameId: string, tmmProfileName: string, newName?: string): Promise<Profile> {
		return await invoke('import_from_tmm', { gameId, newName, tmmProfileName });
	}
}

export const profileService = new ProfileService();
