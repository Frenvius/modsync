import { invoke } from '@tauri-apps/api/core';

export type ConfigValueType =
	| { type: 'Float'; value: number }
	| { value: string; type: 'String' }
	| { value: number; type: 'Integer' }
	| { value: boolean; type: 'Boolean' }
	| { value: string; type: 'KeyboardShortcut' }
	| { type: 'Choice'; value: { value: string; options: string[] } };

export interface ConfigEntry {
	key: string;
	value: ConfigValueType;
	description: null | string;
	default_value: null | string;
	acceptable_values: null | string[];
}

export interface ConfigSection {
	name: string;
	entries: ConfigEntry[];
}

export interface ConfigFile {
	path: string;
	filename: string;
	mod_name: null | string;
	sections: ConfigSection[];
}

export interface ConfigFileSummary {
	path: string;
	filename: string;
	entry_count: number;
	section_count: number;
	mod_name: null | string;
}

class ConfigService {
	async parseConfigFile(path: string): Promise<ConfigFile> {
		return invoke<ConfigFile>('parse_config_file', { path });
	}

	async resetConfigEntry(path: string, section: string, key: string): Promise<string> {
		return invoke<string>('reset_config_entry', { key, path, section });
	}

	async getConfigSummaries(profilePath: string): Promise<ConfigFileSummary[]> {
		return invoke<ConfigFileSummary[]>('get_config_summaries', { profilePath });
	}

	async setConfigEntry(path: string, section: string, key: string, value: string): Promise<void> {
		return invoke('set_config_entry', { key, path, value, section });
	}
}

export const configService = new ConfigService();
