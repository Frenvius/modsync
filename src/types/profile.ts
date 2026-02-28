export interface Profile {
	id: string;
	name: string;
	path: string;
	gameId: string;
	createdAt: number;
	updatedAt: number;
	mods: ProfileMod[];
}

export interface ProfileSummary {
	id: string;
	name: string;
	gameId: string;
	modCount: number;
	createdAt: number;
	updatedAt: number;
}

export interface ProfileMod {
	id: string;
	kind: ModKind;
	version: string;
	enabled: boolean;
	packageId: string;
	installTime: number;
}

export type ModKind =
	| { type: 'local'; sourcePath: null | string }
	| { fullName: string; type: 'thunderstore'; dependencies: string[] };

export interface TmmProfileInfo {
	name: string;
	path: string;
	modCount: number;
	hasBepinex: boolean;
}
