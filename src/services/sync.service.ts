import { invoke } from '@tauri-apps/api/core';
import { getCurrent } from '@tauri-apps/api/window';

export interface Modpack {
	id: string;
	name: string;
	mods: ModEntry[];
	updated_at: string;
	configs: ConfigEntry[];
}

export interface ModEntry {
	path: string;
	size: number;
	sha256: string;
	filename: string;
	is_custom: boolean;
	name: null | string;
	author: null | string;
	thunderstore_id: null | string;
	thunderstore_version: null | string;
}

export interface ConfigEntry {
	path: string;
	size: number;
	sha256: string;
}

export interface ShareCode {
	host: string;
	port: number;
	modpack_id: string;
}

export interface SyncResult {
	message: string;
	success: boolean;
	mods_removed: number;
	mods_downloaded: number;
	configs_removed: number;
	configs_downloaded: number;
}

export type SyncStatus = 'Host' | 'Synced' | 'OutOfSync' | 'HostOffline' | 'NotConnected';

class SyncService {
	async isHosting(): Promise<boolean> {
		return await invoke('is_hosting');
	}

	async stopSharing(): Promise<void> {
		return await invoke('stop_sharing');
	}
	async joinModpack(shareCode: string): Promise<Modpack> {
		return await invoke('join_modpack', { shareCode });
	}

	async decodeShareCode(code: string): Promise<ShareCode> {
		return await invoke('decode_share_code_cmd', { code });
	}

	async scanLocalMods(modpackName: string, modpackId: string): Promise<Modpack> {
		return await invoke('scan_local_mods', { modpackId, modpackName });
	}

	async getShareCode(host: string, port: number, modpackId: string): Promise<string> {
		return await invoke('get_share_code', { host, port, modpackId });
	}

	async startSharing(port: number, modpackName: string, modpackId: string): Promise<string> {
		return await invoke('start_sharing', { port, modpackId, modpackName });
	}

	async getSyncStatus(host: string, port: number, modpackName: string, modpackId: string): Promise<SyncStatus> {
		return await invoke('get_sync_status_cmd', { host, port, modpackId, modpackName });
	}

	async syncMods(host: string, port: number, modpackName: string, modpackId: string): Promise<SyncResult> {
		return await invoke('sync_mods', {
			host,
			port,
			modpackId,
			modpackName,
			window: getCurrent()
		});
	}
}

export const syncService = new SyncService();
