export interface ModpackMod {
	slug: string;
	title: string;
	author: string;
	version: string;
	enabled?: boolean;
	icon_url: null | string;
	filename?: null | string;
	version_id: null | string;
}

export interface Modpack {
	id: string;
	name: string;
	loader: string;
	is_owner: boolean;
	mods: ModpackMod[];
	created_at: string;
	updated_at: string;
	minecraft_version: string;
	share_code: null | string;
	image_path: null | string;
	description: null | string;
	owner_address: null | string;
}

export interface SyncStatus {
	is_synced: boolean;
	owner_online: boolean;
	local_mod_count: number;
	remote_mod_count: null | number;
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
	minecraft_version: null | string;
	progress: null | InstallProgress;
}

export interface DetectedMod {
	name: string;
	mod_id: string;
	author: string;
	version: string;
	filename: string;
	modrinth_slug: null | string;
	modrinth_title: null | string;
	modrinth_icon_url: null | string;
	modrinth_project_id: null | string;
}
