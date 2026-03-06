interface ModpackMod {
	slug: string;
	title: string;
	author: string;
	version: string;
	icon_url: null | string;
}

export interface Modpack {
	id: string;
	name: string;
	game_id: string;
	game_version: string;
	loader: null | string;
	is_owner: boolean;
	mods: ModpackMod[];
	created_at: string;
	updated_at: string;
	share_code: null | string;
	image_path: null | string;
	description: null | string;
}

export interface SyncStatus {
	is_synced: boolean;
	owner_online: boolean;
	local_mod_count: number;
	remote_mod_count: null | number;
}

export interface SyncStatusMap {
	[modpackId: string]: {
		checking: boolean;
		status: null | SyncStatus;
	};
}

export interface InstallProgress {
	stage: string;
	total: number;
	current: number;
	message: string;
}

export interface InstallStatus {
	installed: boolean;
	installing: boolean;
	loader: null | string;
	last_played: null | string;
	loader_version: null | string;
	game_version: null | string;
	progress: null | InstallProgress;
}

export interface InstallStatusMap {
	[modpackId: string]: null | InstallStatus;
}
