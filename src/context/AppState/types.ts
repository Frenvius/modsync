import { ReactNode } from 'react';
import { Update } from '@tauri-apps/plugin-updater';

import { SyncStatus } from '~/services/sync.service';

export type ProgressType = 'query' | 'buffer' | undefined | 'determinate' | 'indeterminate';

export interface TmmProfile {
	name: string;
	hasMods: boolean;
	bepinexPath: string;
}

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
	hostAddress: string;
	modpackName: string;
	syncProgress: number;
	isInstalled: boolean;
	needsUpdate: boolean;
	update: null | Update;
	playDisabled: boolean;
	syncStatus: SyncStatus;
	isShareStarting: boolean;
	tmmProfiles: TmmProfile[];
	progressType: ProgressType;
	activeTmmProfile: null | string;
	setModpackId: (id: string) => void;
	setHostPort: (port: number) => void;
	setShareCode: (code: string) => void;
	setModpackName: (name: string) => void;
	refreshTmmProfiles: () => Promise<void>;
	setIsHosting: (hosting: boolean) => void;
	setHostAddress: (address: string) => void;
	setSyncStatus: (status: SyncStatus) => void;
	setIsShareStarting: (starting: boolean) => void;
	setActiveTmmProfile: (name: string) => Promise<void>;
	setConfig: (key: string, value: null | string | number | boolean) => Promise<void>;
}

export interface Config {
	hostPort: number;
	update?: boolean;
	publicIp?: string;
	shareCode?: string;
	modpackId?: string;
	valheimPath: string;
	installed?: boolean;
	hostAddress?: string;
	modpackName?: string;
	tmmProfiles?: TmmProfile[];
	activeTmmProfile: null | string;
}

export interface AppStateProviderProps {
	config: Config;
	children: ReactNode;
	updateData: null | Update;
}
