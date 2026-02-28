import React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { relaunch } from '@tauri-apps/plugin-process';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import LogPanel from '~/components/LogPanel';
import SyncStatus from '~/components/SyncStatus';
import { syncService } from '~/services/sync.service';
import { stateService } from '~/services/state.service';
import { commandService } from '~/services/command.service';
import { AppStateContext } from '~/context/AppState/constants';

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
		<div className="flex flex-col h-full gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Mod Updater</h1>
					<p className="text-sm text-muted-foreground">
						{activeTmmProfile && <span className="text-primary">[{activeTmmProfile}]</span>} {statusText}
					</p>
				</div>
				<div className="flex items-center gap-3">
					{isInstalled && <SyncStatus status={syncStatus} onClick={handleSync} />}
					<div onClick={handleUpdate} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
						{hasUpdate ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<div className="text-primary hover:underline">
										{appVersion} &rarr; {update?.version}
									</div>
								</TooltipTrigger>
								<TooltipContent side="top">Click to update</TooltipContent>
							</Tooltip>
						) : (
							<span>{appVersion}</span>
						)}
					</div>
				</div>
			</div>
			<div className="flex-1 min-h-0">
				<LogPanel />
			</div>
			<div className="flex items-center gap-4">
				<div className="flex-1">
					<Progress glow={syncProgress > 0 && syncProgress < 100} value={progressType === 'indeterminate' ? undefined : syncProgress} />
				</div>
				<Button size="lg" variant="glow" onClick={playButton} className="min-w-[120px]" disabled={playDisabled || isShareStarting}>
					{getPlayButtonText()}
				</Button>
			</div>
		</div>
	);
};

export default Home;
