import { invoke } from '@tauri-apps/api/core';

export interface PackageInfo {
	name: string;
	icon: string;
	owner: string;
	rating: number;
	version: string;
	full_name: string;
	downloads: number;
	description: string;
	categories: string[];
	date_updated: string;
	is_deprecated: boolean;
	dependencies: string[];
}

export interface SearchResult {
	page: number;
	page_size: number;
	total_count: number;
	total_pages: number;
	packages: PackageInfo[];
}

export interface GameInfo {
	id: string;
	name: string;
}

export type SortBy = 'name' | 'rating' | 'downloads' | 'last_updated';

export interface SearchOptions {
	page?: number;
	query?: string;
	sortBy?: SortBy;
	category?: string;
	pageSize?: number;
	includeDeprecated?: boolean;
}

class ThunderstoreService {
	async refreshCache(): Promise<void> {
		return invoke('thunderstore_refresh_cache');
	}

	async getGames(): Promise<GameInfo[]> {
		return invoke<GameInfo[]>('thunderstore_get_games');
	}

	async getCategories(game: string): Promise<string[]> {
		return invoke<string[]>('thunderstore_get_categories', { game });
	}

	async getPackage(game: string, fullName: string): Promise<null | PackageInfo> {
		return invoke<null | PackageInfo>('thunderstore_get_package', {
			game,
			fullName,
		});
	}

	async installPackage(game: string, fullName: string, version: string, targetPath: string): Promise<void> {
		return invoke('thunderstore_install_package', {
			game,
			version,
			fullName,
			targetPath,
		});
	}

	async getPackagesBulk(game: string, fullNames: string[]): Promise<Record<string, PackageInfo>> {
		if (fullNames.length === 0) {
			return {};
		}
		return invoke<Record<string, PackageInfo>>('thunderstore_get_packages_bulk', {
			game,
			fullNames,
		});
	}

	async search(game: string, options: SearchOptions = {}): Promise<SearchResult> {
		return invoke<SearchResult>('thunderstore_search', {
			game,
			page: options.page ?? 0,
			query: options.query || null,
			sortBy: options.sortBy || null,
			pageSize: options.pageSize ?? 20,
			category: options.category || null,
			includeDeprecated: options.includeDeprecated ?? false,
		});
	}
}

export const thunderstoreService = new ThunderstoreService();
