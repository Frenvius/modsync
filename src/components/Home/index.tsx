import React from 'react';
import { Button } from '@/components/ui/button';
import { relaunch } from '@tauri-apps/plugin-process';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import styles from './styles.module.scss';
import LogPanel from '~/components/LogPanel';
import SyncStatus from '~/components/SyncStatus';
import { syncService } from '~/services/sync.service';
import { stateService } from '~/services/state.service';
import { commandService } from '~/services/command.service';
import { AppStateContext } from '~/context/AppState/constants';
import LinearProgressWithLabel from '~/components/common/LinearProgressWithLabel';

const Home = () => {
	const { update, playText, appVersion, statusText, isInstalled, needsUpdate, syncProgress, playDisabled, progressType, activeTmmProfile } =
		React.useContext(AppStateContext);
	const { hostPort, isHosting, modpackId, syncStatus, hostAddress, modpackName, setSyncStatus, isShareStarting } =
		React.useContext(AppStateContext);

	React.useEffect(() => {
		if (hostAddress && hostPort && !isHosting) {
			const checkStatus = async () => {
				const status = await syncService.getSyncStatus(hostAddress, hostPort, modpackName, modpackId);
				setSyncStatus(status);
			};

			checkStatus();
			const interval = setInterval(checkStatus, 10000);
			return () => clearInterval(interval);
		} else if (isHosting) {
			setSyncStatus('Host');
		}
	}, [hostAddress, hostPort, isHosting]);

	const playButton = async () => {
		if (!isInstalled) {
			await stateService.setNotInstalled();
			await stateService.dispatch('set_log', '-> Please share your mods or join a modpack');
			return;
		}

		if (needsUpdate || syncStatus === 'OutOfSync') {
			await handleSync();
			return;
		}

		await commandService.startGame();
	};

	const handleSync = async () => {
		if (!hostAddress || !hostPort) {
			await stateService.dispatch('set_log', '-> No host configured. Please join a modpack first.');
			return;
		}

		try {
			await stateService.setUpdating();
			const result = await syncService.syncMods(hostAddress, hostPort, modpackName, modpackId);

			if (result.success) {
				await stateService.setInstalled();
				setSyncStatus('Synced');
				await stateService.dispatch('set_log', `-> ${result.message}`);
			} else {
				await stateService.dispatch('set_log', `-> Sync failed: ${result.message}`);
			}
		} catch (err) {
			await stateService.dispatch('set_log', `-> Sync error: ${err}`);
			await stateService.setReady(false);
		}
	};

	const hasUpdate = update?.currentVersion !== update?.version;

	const handleUpdate = async () => {
		await update?.downloadAndInstall();
		await relaunch();
	};

	const getPlayButtonText = () => {
		if (playText !== 'Play') return playText;
		if (!isInstalled) return 'Setup';
		if (syncStatus === 'OutOfSync') return 'Update';
		return 'Play';
	};

	return (
		<div className={styles.container}>
			<LogPanel />
			<div className="grid grid-cols-12 gap-1">
				<div className="col-span-12 flex items-center justify-between text-xs">
					<div className="flex items-center gap-2">
						<div>
							{activeTmmProfile && <span style={{ color: '#888' }}>[{activeTmmProfile}]</span>} Status: {statusText}
						</div>
						{isInstalled && <SyncStatus status={syncStatus} onClick={handleSync} />}
					</div>
					<div onClick={handleUpdate} className={styles.updateButton}>
						{hasUpdate ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<div className={styles.link}>
										{appVersion} &#8594; {update?.version}
									</div>
								</TooltipTrigger>
								<TooltipContent side="top">
									Click to update
								</TooltipContent>
							</Tooltip>
						) : (
							appVersion
						)}
					</div>
				</div>
				<div className="col-span-9">
					<LinearProgressWithLabel value={syncProgress} variant={progressType} />
				</div>
				<div className="col-span-3">
					<Button onClick={playButton} className={styles.playButton} disabled={playDisabled || isShareStarting}>
						{getPlayButtonText()}
					</Button>
				</div>
			</div>
		</div>
	);
};

export default Home;
