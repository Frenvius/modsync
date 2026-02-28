import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

import { profileService } from '~/services/profile.service';
import { AppStateContext } from '~/context/AppState/constants';
import { SyncStatus, syncService } from '~/services/sync.service';
import { TmmProfile, ProgressType, AppStateProviderProps } from '~/context/AppState/types';

const AppStateProvider: React.FC<AppStateProviderProps> = ({ config, children, updateData }) => {
	const [playText, setPlayText] = React.useState('Play');
	const [appVersion, setAppVersion] = React.useState('');
	const [syncProgress, setSyncProgress] = React.useState(0);
	const [playDisabled, setPlayDisabled] = React.useState(false);
	const [statusText, setStatusText] = React.useState('Ready to play');
	const [needsUpdate, setNeedsUpdate] = React.useState(config.update || false);
	const [progressType, setProgressType] = React.useState('determinate' as ProgressType);

	const [isHosting, setIsHosting] = React.useState(false);
	const [isShareStarting, setIsShareStarting] = React.useState(false);
	const [hostAddress, setHostAddressState] = React.useState(config.hostAddress || '');
	const [hostPort, setHostPort] = React.useState(config.hostPort || 7878);
	const [publicIp, setPublicIp] = React.useState(config.publicIp || '');
	const [shareCode, setShareCodeState] = React.useState(config.shareCode || '');
	const [syncStatus, setSyncStatus] = React.useState<SyncStatus>('NotConnected');
	const [modpackId, setModpackIdState] = React.useState(config.modpackId || '');
	const [modpackName, setModpackNameState] = React.useState(config.modpackName || '');

	const [activeTmmProfile, setActiveTmmProfileState] = React.useState<null | string>(config.activeTmmProfile || null);
	const [tmmProfiles, setTmmProfiles] = React.useState<TmmProfile[]>(config.tmmProfiles || []);

	const [valheimPath, setValheimPath] = React.useState(config.valheimPath || '');

	const computeIsInstalled = React.useCallback(() => {
		const activeProfile = tmmProfiles.find((p) => p.name === activeTmmProfile);
		return !!(activeProfile?.hasMods && valheimPath);
	}, [tmmProfiles, activeTmmProfile, valheimPath]);

	const [isInstalled, setIsInstalled] = React.useState(() => computeIsInstalled());

	const setConfigValue = async (key: string, value: null | string | number | boolean): Promise<void> => {
		await invoke('set_config', { key, value });
		if (key === 'valheimPath' && typeof value === 'string') {
			setValheimPath(value);
		}
		if (key === 'publicIp' && typeof value === 'string') {
			setPublicIp(value);
		}
		if (key === 'hostPort' && typeof value === 'number') {
			setHostPort(value);
		}
	};

	React.useEffect(() => {
		setIsInstalled(computeIsInstalled());
	}, [computeIsInstalled]);

	const refreshTmmProfiles = async () => {
		try {
			const profiles = await profileService.discoverTmmProfiles();
			setTmmProfiles(profiles);
		} catch (err) {
			console.error('Failed to refresh TMM profiles:', err);
		}
	};

	const setActiveTmmProfile = async (name: string) => {
		try {
			if (isHosting) {
				await invoke('stop_sharing');
				setIsHosting(false);
			}

			await setConfigValue('activeTmmProfile', name);
			setActiveTmmProfileState(name);

			setModpackNameState(name);
			setConfigValue('modpackName', name);
		} catch (err) {
			console.error('Failed to set active TMM profile:', err);
		}
	};

	const setUpdateNeeded = (update: boolean) => {
		setConfigValue('update', update).then(() => {
			setNeedsUpdate(update);
		});
	};

	const setProgress = (value: number) => {
		if (value < 100) {
			setSyncProgress(value);
			setStatusText(`Syncing ${value}%`);
		}
	};

	const listenEvent = (event: string, callback: (event: any) => void, unlisted: UnlistenFn[]) => {
		listen(event, ({ payload }) => callback(payload)).then((unsubscribe) => unlisted.push(unsubscribe));
	};

	React.useEffect(() => {
		const unlisted: UnlistenFn[] = [];

		listenEvent('play_text', setPlayText, unlisted);
		listenEvent('status_text', setStatusText, unlisted);
		listenEvent('sync_progress', setSyncProgress, unlisted);
		listenEvent('needs_update', setUpdateNeeded, unlisted);
		listenEvent('progress_type', setProgressType, unlisted);
		listenEvent('play_disabled', setPlayDisabled, unlisted);

		listen('sync_progress', ({ payload }: any) => {
			if (payload && typeof payload === 'object') {
				const { total, phase, current } = payload;
				if (total > 0) {
					const percent = Math.round((current / total) * 100);
					setProgress(percent);
					setStatusText(`${phase}: ${percent}%`);
				}
			}
		}).then((unsubscribe) => unlisted.push(unsubscribe));

		listen('scanning-progress', ({ payload }: any) => {
			if (payload && typeof payload === 'object') {
				const { total, current } = payload;
				if (total > 0) {
					const percent = Math.round((current / total) * 100);
					setSyncProgress(percent);
					setStatusText(`Scanning ${current}/${total}`);
				}
			}
		}).then((unsubscribe) => unlisted.push(unsubscribe));

		listen('scanning-complete', () => {
			setSyncProgress(100);
			setStatusText('Ready to play');
		}).then((unsubscribe) => unlisted.push(unsubscribe));

		listen('server-ready', () => {
			setSyncProgress(0);
			setStatusText('Hosting');
			setIsShareStarting(false);
		}).then((unsubscribe) => unlisted.push(unsubscribe));

		return () => {
			unlisted.forEach((unsubscribe) => unsubscribe());
		};
	}, []);

	React.useEffect(() => {
		getVersion().then((version: string) => {
			setAppVersion(version || '0.0.0');
		});
	}, []);

	React.useEffect(() => {
		syncService.isHosting().then((hosting) => {
			if (hosting) {
				setIsHosting(true);
				setSyncStatus('Host');
				setStatusText('Hosting');
			}
		});
	}, []);

	React.useEffect(() => {
		if (activeTmmProfile && !modpackName) {
			setModpackNameState(activeTmmProfile);
		}
	}, []);

	return (
		<AppStateContext.Provider
			value={{
				config,
				playText,
				hostPort,
				publicIp,
				isHosting,
				shareCode,
				modpackId,
				statusText,
				appVersion,
				syncStatus,
				isInstalled,
				needsUpdate,
				hostAddress,
				modpackName,
				tmmProfiles,
				syncProgress,
				playDisabled,
				progressType,
				setSyncStatus,
				isShareStarting,
				activeTmmProfile,
				update: updateData,
				refreshTmmProfiles,
				setActiveTmmProfile,
				setConfig: setConfigValue,
				setIsHosting: (hosting: boolean) => {
					setIsHosting(hosting);
				},
				setIsShareStarting: (starting: boolean) => {
					setIsShareStarting(starting);
				},
				setHostPort: (port: number) => {
					setHostPort(port);
					setConfigValue('hostPort', port);
				},
				setModpackId: (id: string) => {
					setModpackIdState(id);
					setConfigValue('modpackId', id);
				},
				setShareCode: (code: string) => {
					setShareCodeState(code);
					setConfigValue('shareCode', code);
				},
				setModpackName: (name: string) => {
					setModpackNameState(name);
					setConfigValue('modpackName', name);
				},
				setHostAddress: (address: string) => {
					setHostAddressState(address);
					setConfigValue('hostAddress', address);
				}
			}}
		>
			{children}
		</AppStateContext.Provider>
	);
};

export default AppStateProvider;
