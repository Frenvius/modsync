export interface JavaRuntime {
	path: string;
	version: string;
}

export interface AppSettings {
	java_path: null | string;
	memory_min: null | string;
	memory_max: null | string;
}
