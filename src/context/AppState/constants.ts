import { createContext } from 'react';

import { Config, AppStateContextProps } from './types';

const initialState: AppStateContextProps = {
	update: null,
	playText: '',
	publicIp: '',
	shareCode: '',
	modpackId: '',
	appVersion: '',
	statusText: '',
	hostPort: 7878,
	syncProgress: 0,
	hostAddress: '',
	modpackName: '',
	tmmProfiles: [],
	isHosting: false,
	isInstalled: false,
	needsUpdate: false,
	playDisabled: false,
	config: {} as Config,
	setHostPort: () => {},
	isShareStarting: false,
	activeTmmProfile: null,
	setIsHosting: () => {},
	setShareCode: () => {},
	setModpackId: () => {},
	progressType: undefined,
	setSyncStatus: () => {},
	setHostAddress: () => {},
	setModpackName: () => {},
	setConfig: async () => {},
	syncStatus: 'NotConnected',
	setIsShareStarting: () => {},
	refreshTmmProfiles: async () => {},
	setActiveTmmProfile: async () => {}
};

export const AppStateContext = createContext<AppStateContextProps>(initialState);
