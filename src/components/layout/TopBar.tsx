import { Button } from '@/components/ui/button';
import { getCurrent } from '@tauri-apps/api/window';
import { useState, useEffect, useContext } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { X, Copy, Minus, Square, Trash2, Settings2, FolderOpen } from 'lucide-react';
import { Select, SelectItem, SelectValue, SelectContent, SelectTrigger } from '@/components/ui/select';
import {
	Dialog,
	DialogTitle,
	DialogHeader,
	DialogFooter,
	DialogContent,
	DialogDescription,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

import JoinDialog from '~/components/JoinDialog';
import { stateService } from '~/services/state.service';
import R2zImportDialog from '~/components/R2zImportDialog';
import { commandService } from '~/services/command.service';
import { Modpack, syncService } from '~/services/sync.service';
import { AppStateContext } from '~/context/AppState/constants';
import ProfileCreateDialog from '~/components/ProfileCreateDialog';

export function TopBar() {
	const [isMaximized, setIsMaximized] = useState(false);
	const [joinDialogOpen, setJoinDialogOpen] = useState(false);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [r2zDialogOpen, setR2zDialogOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const appWindow = getCurrent();

	const {
		config,
		playText,
		publicIp,
		hostPort,
		profiles,
		isHosting,
		modpackId,
		isReadOnly,
		syncStatus,
		activeGame,
		needsUpdate,
		modpackName,
		hostAddress,
		setHostPort,
		playDisabled,
		setIsHosting,
		setShareCode,
		setModpackId,
		setSyncStatus,
		activeProfile,
		deleteProfile,
		setHostAddress,
		setModpackName,
		shareCode,
		isShareStarting,
		activeProfileId,
		refreshProfiles,
		setActiveProfile,
		setIsShareStarting,
	} = useContext(AppStateContext);

	const [copied, setCopied] = useState(false);

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

	const handleProfileChange = async (profileId: string) => {
		if (profileId) {
			await setActiveProfile(profileId);
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
			} catch (err) {
				console.error('Error stopping share:', err);
			} finally {
				setIsShareStarting(false);
			}
		} else {
			const port = hostPort || 7878;

			if (!publicIp) {
				return;
			}

			setIsShareStarting(true);
			try {
				await syncService.startSharing(port, modpackName, modpackId);
				const code = await syncService.getShareCode(publicIp, port, modpackId);
				setShareCode(code);
				setIsHosting(true);
				setSyncStatus('Host');
			} catch (err) {
				console.error('Error starting share:', err);
				setIsShareStarting(false);
			}
		}
	};

	const handleCopyShareCode = async () => {
		if (shareCode) {
			await navigator.clipboard.writeText(shareCode);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleJoined = async (code: string, host: string, port: number, modpack: Modpack, _profileName: string) => {
		try {
			setShareCode(code);
			setHostAddress(host);
			setHostPort(port);
			setModpackId(modpack.id);
			setModpackName(modpack.name);

			await stateService.setUpdating();
			const result = await syncService.syncMods(host, port, modpack.name, modpack.id);

			if (result.success) {
				await stateService.setInstalled();
				setSyncStatus('Synced');
			}
		} catch (err) {
			console.error('Error joining:', err);
			setSyncStatus('OutOfSync');
		}
	};

	const getPlayButtonText = () => {
		if (playText !== 'Play') return playText;
		if (syncStatus === 'OutOfSync') return 'Update';
		return 'Play';
	};

	const handleSync = async () => {
		if (!hostAddress || !hostPort) {
			return;
		}

		try {
			await stateService.setUpdating();
			const result = await syncService.syncMods(hostAddress, hostPort, modpackName, modpackId);

			if (result.success) {
				await stateService.setInstalled();
				setSyncStatus('Synced');
			}
		} catch (err) {
			await stateService.setReady();
		}
	};

	const playButton = async () => {
		if (needsUpdate || syncStatus === 'OutOfSync') {
			await handleSync();
			return;
		}

		await commandService.startGame();
	};

	const isConfigEmpty = Object.keys(config).length === 0;

	return (
		<>
			<header
				data-tauri-drag-region
				className="h-[50px] border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-40 select-none"
			>
				<div data-tauri-drag-region className="h-full flex items-center justify-between px-4">
					<div className="flex items-center gap-2">
						{!isConfigEmpty && (
							<>
								<Select
									onValueChange={handleProfileChange}
									value={activeProfileId ?? undefined}
									disabled={profiles.length === 0 || isReadOnly}
								>
									<SelectTrigger className="h-8 min-w-[120px] max-w-[180px] bg-secondary border-border text-sm rounded-lg">
										<SelectValue placeholder="No profiles" />
									</SelectTrigger>
									<SelectContent>
										{profiles.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												{p.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											size="sm"
											variant="ghost"
											disabled={isReadOnly}
											className="h-8 w-8 p-0"
										>
											<Settings2 className="w-4 h-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start">
										<DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
											Create empty profile
										</DropdownMenuItem>
										<DropdownMenuItem onClick={() => setR2zDialogOpen(true)}>
											Import R2Z profile
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={!activeProfile?.path}
											onClick={() => commandService.openFolder(activeProfile!.path)}
										>
											<FolderOpen className="w-4 h-4 mr-2" />
											Open profile folder
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											disabled={!activeProfileId}
											onClick={() => setDeleteDialogOpen(true)}
											className="text-destructive focus:text-destructive"
										>
											<Trash2 className="w-4 h-4 mr-2" />
											Delete profile
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>

								<Button
									size="sm"
									variant="glow"
									onClick={playButton}
									className="h-8 px-4"
									disabled={playDisabled || isShareStarting}
								>
									{getPlayButtonText()}
								</Button>
							</>
						)}
					</div>
					<div className="flex items-center gap-2">
						{!isConfigEmpty && (
							<>
								{isHosting && shareCode && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												size="sm"
												variant="outline"
												className="h-8 px-2"
												onClick={handleCopyShareCode}
											>
												<Copy className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>{copied ? 'Copied!' : 'Copy share code'}</TooltipContent>
									</Tooltip>
								)}
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											size="sm"
											className="h-8 px-3"
											onClick={handleShareToggle}
											disabled={isShareStarting || isReadOnly}
											variant={isHosting ? 'default' : 'outline'}
										>
											{isShareStarting ? '...' : isHosting ? 'Stop' : 'Share'}
										</Button>
									</TooltipTrigger>
									<TooltipContent>{isReadOnly ? 'Read-only mode' : isHosting ? 'Stop sharing' : 'Start sharing'}</TooltipContent>
								</Tooltip>
								<Button size="sm" variant="outline" className="h-8 px-3" disabled={isHosting || isReadOnly} onClick={() => setJoinDialogOpen(true)}>
									Join
								</Button>
							</>
						)}
						<div data-tauri-drag-region="false" className="flex items-center ml-2 -mr-4">
							<button
								onClick={() => appWindow.minimize()}
								className="h-[50px] px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
							>
								<Minus className="w-4 h-4 text-muted-foreground" />
							</button>
							<button
								onClick={() => isMaximized ? appWindow.unmaximize() : appWindow.maximize()}
								className="h-[50px] px-4 hover:bg-muted/50 transition-colors flex items-center justify-center"
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

			<ProfileCreateDialog
				gameId={activeGame}
				open={createDialogOpen}
				onClose={() => setCreateDialogOpen(false)}
				onCreated={async (profile) => {
					setCreateDialogOpen(false);
					await refreshProfiles();
					await setActiveProfile(profile.id);
				}}
			/>

			<R2zImportDialog
				gameId={activeGame}
				open={r2zDialogOpen}
				onClose={() => setR2zDialogOpen(false)}
				onImported={async (profile) => {
					setR2zDialogOpen(false);
					await refreshProfiles();
					await setActiveProfile(profile.id);
				}}
			/>

			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete profile</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this profile? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={async () => {
								if (activeProfileId) {
									await deleteProfile(activeProfileId);
								}
								setDeleteDialogOpen(false);
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
