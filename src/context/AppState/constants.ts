import { createContext } from 'react';

import { Config, AppStateContextProps } from './types';

const initialState: AppStateContextProps = {
	update: null,
	playText: '',
	publicIp: '',
	profiles: [],
	shareCode: '',
	modpackId: '',
	appVersion: '',
	statusText: '',
	hostPort: 7878,
	activeGame: '',
	syncProgress: 0,
	hostAddress: '',
	modpackName: '',
	isHosting: false,
	isReadOnly: false,
	isInstalled: false,
	needsUpdate: false,
	playDisabled: false,
	activeProfile: null,
	config: {} as Config,
	setHostPort: () => {},
	activeProfileId: null,
	isShareStarting: false,
	setIsHosting: () => {},
	setShareCode: () => {},
	setModpackId: () => {},
	progressType: undefined,
	setSyncStatus: () => {},
	setActiveGame: () => {},
	setHostAddress: () => {},
	setModpackName: () => {},
	setConfig: async () => {},
	syncStatus: 'NotConnected',
	setIsShareStarting: () => {},
	deleteProfile: async () => {},
	refreshProfiles: async () => {},
	setActiveProfile: async () => {},
	createProfile: async () => ({ id: '', name: '', path: '', mods: [], gameId: '', createdAt: 0, updatedAt: 0 })
};

export const AppStateContext = createContext<AppStateContextProps>(initialState);
