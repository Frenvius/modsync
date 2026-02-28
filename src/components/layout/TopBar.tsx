import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { getCurrent } from '@tauri-apps/api/window';
import { useState, useEffect, useContext } from 'react';
import { X, Copy, Minus, Square, Settings2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectItem, SelectValue, SelectContent, SelectTrigger } from '@/components/ui/select';

import JoinDialog from '~/components/JoinDialog';
import { stateService } from '~/services/state.service';
import { Modpack, syncService } from '~/services/sync.service';
import { AppStateContext } from '~/context/AppState/constants';

export function TopBar() {
	const [isMaximized, setIsMaximized] = useState(false);
	const [joinDialogOpen, setJoinDialogOpen] = useState(false);
	const [isConfiguring, setIsConfiguring] = useState(false);
	const [isPathValid, setIsPathValid] = useState(false);
	const appWindow = getCurrent();

	const {
		config,
		publicIp,
		hostPort,
		isHosting,
		modpackId,
		modpackName,
		tmmProfiles,
		setHostPort,
		setIsHosting,
		setShareCode,
		setModpackId,
		setSyncStatus,
		setHostAddress,
		setModpackName,
		isShareStarting,
		activeTmmProfile,
		setIsShareStarting,
		setActiveTmmProfile
	} = useContext(AppStateContext);

	useEffect(() => {
		const checkMaximized = async () => {
			setIsMaximized(await appWindow.isMaximized());
		};
		checkMaximized();

		const unlisten = appWindow.onResized(async () => {
			setIsMaximized(await appWindow.isMaximized());
		});

		return () => {
			unlisten.then((fn: () => void) => fn());
		};
	}, []);

	useEffect(() => {
		const checkPath = async () => {
			if (config.valheimPath) {
				const valid = await invoke<boolean>('is_valid_valheim_path', { path: config.valheimPath });
				setIsPathValid(valid);
			} else {
				setIsPathValid(false);
			}
		};
		checkPath();
	}, [config.valheimPath]);

	const handleConfigure = async () => {
		setIsConfiguring(true);
		try {
			const detectedPath = await invoke<null | string>('detect_valheim_path');
			if (detectedPath) {
				await invoke('set_config', { key: 'valheimPath', value: detectedPath });
				await stateService.dispatch('set_log', `-> Valheim folder configured: ${detectedPath}`);
			} else {
				await stateService.dispatch('set_log', '-> Could not find Valheim in default location. Please set path in Settings.');
			}
		} catch (error) {
			console.error('Failed to detect Valheim path:', error);
			await stateService.dispatch('set_log', '-> Failed to detect Valheim path.');
		} finally {
			setIsConfiguring(false);
		}
	};

	const handleProfileChange = async (name: string) => {
		if (name) {
			await setActiveTmmProfile(name);
		}
	};

	const handleShareToggle = async () => {
		if (isHosting) {
			setIsShareStarting(true);
			try {
				await syncService.stopSharing();
				setIsHosting(false);
				setShareCode('');
				setSyncStatus('NotConnected');
				await stateService.dispatch('set_log', '-> Stopped sharing');
			} catch (err) {
				await stateService.dispatch('set_log', `-> Error stopping: ${err}`);
			} finally {
				setIsShareStarting(false);
			}
		} else {
			const port = hostPort || 7878;

			if (!publicIp) {
				await stateService.dispatch('set_log', '-> Please set your Public IP in Settings first');
				return;
			}

			setIsShareStarting(true);
			try {
				await stateService.dispatch('set_log', '-> Starting share server...');
				await syncService.startSharing(port, modpackName, modpackId);
				const code = await syncService.getShareCode(publicIp, port, modpackId);
				setShareCode(code);
				setIsHosting(true);
				setSyncStatus('Host');
				await stateService.dispatch('set_log', `-> Sharing! Code: ${code}`);
			} catch (err) {
				await stateService.dispatch('set_log', `-> Error starting share: ${err}`);
				setIsShareStarting(false);
			}
		}
	};

	const handleJoined = async (code: string, host: string, port: number, modpack: Modpack, profileName: string) => {
		try {
			setShareCode(code);
			setHostAddress(host);
			setHostPort(port);
			setModpackId(modpack.id);
			setModpackName(modpack.name);

			await stateService.dispatch('set_log', `-> Joining modpack: ${modpack.name}`);
			await stateService.dispatch('set_log', `-> Syncing to profile: ${profileName}`);

			await stateService.setUpdating();
			const result = await syncService.syncMods(host, port, modpack.name, modpack.id);

			if (result.success) {
				await stateService.setInstalled();
				setSyncStatus('Synced');
				await stateService.dispatch('set_log', `-> ${result.message}`);
			}
		} catch (err) {
			await stateService.dispatch('set_log', `-> Error joining: ${err}`);
			setSyncStatus('OutOfSync');
		}
	};

	const isConfigEmpty = Object.keys(config).length === 0;

	return (
		<>
			<header
				data-tauri-drag-region
				className="h-12 border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-40 select-none"
			>
				<div data-tauri-drag-region className="h-full flex items-center justify-between px-4">
					<div className="flex items-center gap-2">
						{!isConfigEmpty && (
							<Select value={activeTmmProfile || ''} onValueChange={handleProfileChange} disabled={tmmProfiles.length === 0}>
								<SelectTrigger className="h-8 min-w-[120px] max-w-[180px] bg-secondary border-border text-sm rounded-lg">
									<SelectValue placeholder="No profiles" />
								</SelectTrigger>
								<SelectContent>
									{tmmProfiles.length === 0 ? (
										<SelectItem value="" disabled>
											No profiles
										</SelectItem>
									) : (
										tmmProfiles.map((p) => (
											<SelectItem key={p.name} value={p.name}>
												{p.name}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
						)}
					</div>
					<div className="flex items-center gap-2">
						{!isConfigEmpty && (
							<>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="sm"
											variant="ghost"
											className="h-8 px-3"
											onClick={handleConfigure}
											disabled={isConfiguring || isPathValid}
										>
											<Settings2 className="w-4 h-4 mr-1.5" />
											{isConfiguring ? '...' : 'Configure'}
										</Button>
									</TooltipTrigger>
									<TooltipContent>{isPathValid ? 'Valheim configured' : 'Auto-detect Valheim path'}</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="sm"
											className="h-8 px-3"
											disabled={isShareStarting}
											onClick={handleShareToggle}
											variant={isHosting ? 'default' : 'outline'}
										>
											{isShareStarting ? '...' : isHosting ? 'Stop' : 'Share'}
										</Button>
									</TooltipTrigger>
									<TooltipContent>{isHosting ? 'Stop sharing' : 'Start sharing'}</TooltipContent>
								</Tooltip>
								<Button size="sm" variant="outline" disabled={isHosting} className="h-8 px-3" onClick={() => setJoinDialogOpen(true)}>
									Join
								</Button>
							</>
						)}
						<div className="flex items-center ml-2 -mr-4">
							<button
								onClick={() => appWindow.minimize()}
								className="h-12 px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
							>
								<Minus className="w-4 h-4 text-muted-foreground" />
							</button>
							<button
								onClick={() => appWindow.toggleMaximize()}
								className="h-12 px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
							>
								{isMaximized ? (
									<Copy className="w-3.5 h-3.5 text-muted-foreground rotate-180" />
								) : (
									<Square className="w-3 h-3 text-muted-foreground" />
								)}
							</button>
							<button
								onClick={() => appWindow.close()}
								className="h-12 px-4 hover:bg-destructive transition-colors flex items-center justify-center group"
							>
								<X className="w-4 h-4 text-muted-foreground group-hover:text-destructive-foreground" />
							</button>
						</div>
					</div>
				</div>
			</header>

			<JoinDialog open={joinDialogOpen} onJoined={handleJoined} onClose={() => setJoinDialogOpen(false)} />
		</>
	);
}
