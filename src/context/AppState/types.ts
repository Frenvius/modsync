import { ReactNode } from 'react';
import { Update } from '@tauri-apps/plugin-updater';

import { SyncStatus } from '~/services/sync.service';
import { Profile, ProfileSummary } from '~/types/profile';

export type ProgressType = 'query' | 'buffer' | undefined | 'determinate' | 'indeterminate';

export type { Profile, ProfileSummary };

export interface AppStateContextProps {
	config: Config;
	playText: string;
	hostPort: number;
	publicIp: string;
	shareCode: string;
	modpackId: string;
	statusText: string;
	appVersion: string;
	isHosting: boolean;
	activeGame: string;
	isReadOnly: boolean;
	hostAddress: string;
	modpackName: string;
	syncProgress: number;
	isInstalled: boolean;
	needsUpdate: boolean;
	update: null | Update;
	playDisabled: boolean;
	syncStatus: SyncStatus;
	isShareStarting: boolean;
	progressType: ProgressType;
	profiles: ProfileSummary[];
	activeProfile: null | Profile;
	activeProfileId: null | string;
	setModpackId: (id: string) => void;
	setHostPort: (port: number) => void;
	refreshProfiles: () => Promise<void>;
	setShareCode: (code: string) => void;
	setActiveGame: (game: string) => void;
	setModpackName: (name: string) => void;
	setIsHosting: (hosting: boolean) => void;
	setHostAddress: (address: string) => void;
	setSyncStatus: (status: SyncStatus) => void;
	setIsShareStarting: (starting: boolean) => void;
	deleteProfile: (profileId: string) => Promise<void>;
	setActiveProfile: (profileId: string) => Promise<void>;
	createProfile: (name: string, customPath?: string) => Promise<Profile>;
	setConfig: (key: string, value: null | string | number | boolean) => Promise<void>;
}

export interface Config {
	hostPort: number;
	update?: boolean;
	publicIp?: string;
	shareCode?: string;
	modpackId?: string;
	activeGame?: string;
	installed?: boolean;
	hostAddress?: string;
	modpackName?: string;
	activeProfileId?: null | string;
}

export interface AppStateProviderProps {
	config: Config;
	children: ReactNode;
	updateData: null | Update;
}
