export interface ModrinthMod {
	slug: string;
	title: string;
	author: string;
	follows: number;
	downloads: number;
	versions: string[];
	description: string;
	categories: string[];
	icon_url: null | string;
}

export interface SearchResult {
	limit: number;
	offset: number;
	total_hits: number;
	mods: ModrinthMod[];
}

export interface Category {
	name: string;
	icon: string;
	header: string;
	project_type: string;
}

export interface GameVersion {
	major: boolean;
	version: string;
	version_type: string;
}

export interface ModLoader {
	name: string;
	icon: string;
	supported_project_types: string[];
}
