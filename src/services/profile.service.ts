import { invoke } from '@tauri-apps/api/core';

import { YmlMod, Profile, R2zPreview, ModUpdateInfo, ProfileSummary, TmmProfileInfo } from '~/types/profile';

class ProfileService {
	async previewR2z(r2zPath: string): Promise<R2zPreview> {
		return await invoke('preview_r2z', { r2zPath });
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

	async getActiveProfile(gameId: string): Promise<null | Profile> {
		return await invoke('get_active_profile', { gameId });
	}

	async getActiveBepinexPath(gameId: string): Promise<string> {
		return await invoke('get_active_bepinex_path', { gameId });
	}

	async getProfileModsFast(profileId: string): Promise<YmlMod[]> {
		return await invoke('get_profile_mods_fast', { profileId });
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

	async updateProfileModsYml(profileId: string, mods: YmlMod[]): Promise<void> {
		return await invoke('update_profile_mods_yml', { mods, profileId });
	}

	async discoverTmmProfilesForImport(gameId: string): Promise<TmmProfileInfo[]> {
		return await invoke('discover_tmm_profiles_for_import', { gameId });
	}

	async checkProfileUpdates(profileId: string, game: string): Promise<ModUpdateInfo[]> {
		return await invoke('check_profile_updates', { game, profileId });
	}

	async setModEnabled(profileId: string, packageId: string, enabled: boolean): Promise<void> {
		return invoke('set_mod_enabled', { enabled, profileId, packageId });
	}

	async updateAllMods(profileId: string, game: string, updates: ModUpdateInfo[]): Promise<string[]> {
		return await invoke('update_all_mods', { game, updates, profileId });
	}

	async importFromTmm(gameId: string, tmmProfileName: string, newName?: string): Promise<Profile> {
		return await invoke('import_from_tmm', { gameId, newName, tmmProfileName });
	}

	async createProfile(gameId: string, name: string, customPath?: string): Promise<Profile> {
		return await invoke('create_profile', { name, gameId, customPath: customPath ?? null });
	}

	async importR2z(gameId: string, r2zPath: string, profileName?: string): Promise<Profile> {
		return await invoke('import_r2z', { gameId, r2zPath, profileName: profileName ?? null });
	}

	async updateMod(profileId: string, packageId: string, newVersion: string, game: string): Promise<void> {
		return await invoke('update_mod', { game, profileId, packageId, newVersion });
	}
}

export const profileService = new ProfileService();
