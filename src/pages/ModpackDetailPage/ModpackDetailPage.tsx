import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { listen } from '@tauri-apps/api/event';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
	AlertCircle,
	ArrowLeft,
	CheckCircle,
	Copy,
	Download,
	FolderOpen,
	Loader2,
	Package,
	Play,
	Plus,
	RefreshCw,
	Search,
	Settings,
	Share2,
	Trash2,
	Users,
	Wifi,
	WifiOff
} from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { Switch } from '~/components/ui/switch';
import { useGame } from '~/contexts/GameContext';
import { toast } from '~/usecase/hooks/use-toast';
import { Progress } from '~/components/ui/progress';
import { AddModsDialog } from '~/components/modpack/AddModsDialog';
import { AppLayout } from '~/components/layout/AppLayout/AppLayout';
import { EditModpackDialog } from '~/components/modpack/EditModpackDialog';
import { ShareModpackDialog } from '~/components/modpack/ShareModpackDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';

import {
	DetectedMod,
	InstallProgress,
	InstallStatus,
	Modpack,
	ModpackMod,
	ModUpdateInfo,
	SyncProgress,
	SyncResult,
	SyncStatus,
	UpdateCheckResult
} from './types';

const getIconSrc = (iconUrl: string | null | undefined): string | undefined => {
	if (!iconUrl) return undefined;
	if (iconUrl.startsWith('http://') || iconUrl.startsWith('https://')) {
		return iconUrl;
	}
	return convertFileSrc(iconUrl);
};

export default function ModpackDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const { games } = useGame();
	const [addModsOpen, setAddModsOpen] = React.useState(false);
	const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
	const [editDialogOpen, setEditDialogOpen] = React.useState(false);
	const [modpack, setModpack] = React.useState<null | Modpack>(null);
	const [isLoading, setIsLoading] = React.useState(true);
	const [error, setError] = React.useState<null | string>(null);
	const [removingMod, setRemovingMod] = React.useState<null | string>(null);
	const [isSyncing, setIsSyncing] = React.useState(false);
	const [syncStatus, setSyncStatus] = React.useState<null | SyncStatus>(null);
	const [isCheckingSync, setIsCheckingSync] = React.useState(false);
	const [installStatus, setInstallStatus] = React.useState<null | InstallStatus>(null);
	const [isLaunching, setIsLaunching] = React.useState(false);
	const [installProgress, setInstallProgress] = React.useState<null | InstallProgress>(null);
	const [modUpdates, setModUpdates] = React.useState<Record<string, string>>({});
	const [_isCheckingUpdates, setIsCheckingUpdates] = React.useState(false);
	const [togglingMod, setTogglingMod] = React.useState<null | string>(null);
	const [detectedMods, setDetectedMods] = React.useState<DetectedMod[]>([]);
	const [_isScanning, setIsScanning] = React.useState(false);
	const [importingMod, setImportingMod] = React.useState<null | string>(null);
	const [updatingMod, setUpdatingMod] = React.useState<null | string>(null);
	const [thunderstoreUpdates, setThunderstoreUpdates] = React.useState<ModUpdateInfo[]>([]);
	const [isCheckingThunderstoreUpdates, setIsCheckingThunderstoreUpdates] = React.useState(false);
	const [isUpdatingAll, setIsUpdatingAll] = React.useState(false);
	const [modSearch, setModSearch] = React.useState('');
	const [syncProgress, setSyncProgress] = React.useState<SyncProgress | null>(null);
	const [isCloning, setIsCloning] = React.useState(false);
	const autoSyncTriggeredRef = React.useRef(false);

	const checkModUpdates = React.useCallback(async (mods: ModpackMod[], gameVersion: string, loader: string) => {
		if (mods.length === 0) return;

		setIsCheckingUpdates(true);
		const updates: Record<string, string> = {};

		try {
			const checkPromises = mods.map(async (mod) => {
				try {
					const versions = await invoke<Array<{ id: string; version_number: string }>>('get_mod_versions', {
						slug: mod.slug,
						loader: loader,
						gameVersion: gameVersion
					});

					if (versions.length > 0) {
						const latestVersion = versions[0].version_number;
						if (mod.version !== latestVersion) {
							updates[mod.slug] = latestVersion;
						}
					}
				} catch (err) {
					console.warn(`Failed to check updates for ${mod.slug}:`, err);
				}
			});

			await Promise.all(checkPromises);
			setModUpdates(updates);
		} catch (err) {
			console.error('Failed to check for mod updates:', err);
		} finally {
			setIsCheckingUpdates(false);
		}
	}, []);

	const checkThunderstoreUpdates = React.useCallback(async (modpackId: string) => {
		setIsCheckingThunderstoreUpdates(true);
		try {
			const result = await invoke<UpdateCheckResult>('check_thunderstore_updates', {
				modpackId,
				skipLoaders: true
			});
			setThunderstoreUpdates(result.available_updates);
			if (result.check_errors.length > 0) {
				console.warn('Some update checks failed:', result.check_errors);
			}
		} catch (err) {
			console.error('Failed to check Thunderstore updates:', err);
		} finally {
			setIsCheckingThunderstoreUpdates(false);
		}
	}, []);

	const loadModpack = React.useCallback(
		async (modpackId: string) => {
			setIsLoading(true);
			setError(null);
			try {
				const data = await invoke<Modpack>('get_modpack', { id: modpackId });
				setModpack(data);
				if (data.mods.length > 0) {
					const game = games.find((g) => g.id === data.game_id);
					if (game?.mod_source === 'thunderstore') {
						checkThunderstoreUpdates(modpackId);
					} else {
						checkModUpdates(data.mods, data.game_version, data.loader ?? '');
					}
				}
			} catch (err) {
				console.error('Failed to load modpack:', err);
				setError(`Failed to load modpack: ${err}`);
			} finally {
				setIsLoading(false);
			}
		},
		[checkModUpdates, checkThunderstoreUpdates, games]
	);

	const checkSyncStatus = React.useCallback(async (modpackId: string) => {
		setIsCheckingSync(true);
		try {
			const status = await invoke<SyncStatus>('check_sync_status', { modpackId });
			setSyncStatus(status);
		} catch (err) {
			console.error('Failed to check sync status:', err);
		} finally {
			setIsCheckingSync(false);
		}
	}, []);

	const checkInstallStatus = React.useCallback(async (modpackId: string) => {
		try {
			const status = await invoke<InstallStatus>('get_install_status', { modpackId });
			setInstallStatus(status);
			if (status.progress) {
				setInstallProgress(status.progress);
			}
			return status;
		} catch (err) {
			console.error('Failed to check install status:', err);
			return null;
		}
	}, []);

	React.useEffect(() => {
		if (id) {
			loadModpack(id);
			checkInstallStatus(id);
		}
	}, [id, loadModpack, checkInstallStatus]);

	React.useEffect(() => {
		const unlisten = listen<InstallProgress>('install-progress', (event) => {
			setInstallProgress(event.payload);

			if (event.payload.stage === 'complete' && id) {
				setTimeout(() => {
					checkInstallStatus(id);
					setInstallProgress(null);
				}, 1000);
			}
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [id, checkInstallStatus]);

	React.useEffect(() => {
		const unlistenProgress = listen<SyncProgress>('sync:progress', (event) => {
			setSyncProgress(event.payload);
		});

		const unlistenStarted = listen<{ total: number }>('sync:started', () => {
			setSyncProgress({ current: 0, total: 0, mod_name: '', action: 'starting' });
		});

		const unlistenCompleted = listen<SyncResult>('sync:completed', (event) => {
			setSyncProgress(null);
			const { mods_added, mods_removed, mods_updated, mods_toggled, errors } = event.payload;
			const total = mods_added.length + mods_removed.length + mods_updated.length + mods_toggled.length;
			if (total > 0 || errors.length > 0) {
				console.log('Sync completed:', event.payload);
			}
		});

		const unlistenError = listen<{ message: string }>('sync:error', (event) => {
			setSyncProgress(null);
			console.error('Sync error:', event.payload.message);
		});

		return () => {
			unlistenProgress.then((fn) => fn());
			unlistenStarted.then((fn) => fn());
			unlistenCompleted.then((fn) => fn());
			unlistenError.then((fn) => fn());
		};
	}, []);

	React.useEffect(() => {
		if (!id || !installStatus?.installing) return;

		const interval = setInterval(() => {
			checkInstallStatus(id);
		}, 2000);

		return () => clearInterval(interval);
	}, [id, installStatus?.installing, checkInstallStatus]);

	React.useEffect(() => {
		if (modpack && !modpack.is_owner && modpack.id) {
			checkSyncStatus(modpack.id);
		}
	}, [modpack?.id, modpack?.is_owner, checkSyncStatus]);

	React.useEffect(() => {
		if (!modpack || modpack.is_owner || autoSyncTriggeredRef.current || isSyncing) {
			return;
		}

		autoSyncTriggeredRef.current = true;

		const autoSync = async () => {
			setIsSyncing(true);
			setSyncProgress(null);
			try {
				const updated = await invoke<Modpack>('sync_modpack', {
					modpackId: modpack.id
				});
				setModpack(updated);
				setSyncStatus({
					is_synced: true,
					owner_online: true,
					local_mod_count: updated.mods.length,
					remote_mod_count: updated.mods.length
				});
				toast({
					title: 'Sync complete',
					description: `Synced ${updated.mods.length} mods from the modpack owner.`
				});
			} catch (err) {
				console.error('Auto-sync failed:', err);
				toast({
					title: 'Sync failed',
					description: `${err}`,
					variant: 'destructive'
				});
			} finally {
				setIsSyncing(false);
			}
		};

		autoSync();
	}, [modpack?.id, modpack?.is_owner, isSyncing]);

	React.useEffect(() => {
		autoSyncTriggeredRef.current = false;
	}, [id]);

	const handleRemoveMod = async (slug: string, title: string) => {
		if (!modpack) return;

		setRemovingMod(slug);
		try {
			await invoke('remove_mod_from_modpack', {
				slug,
				modpackId: modpack.id
			});

			toast({
				title: 'Mod removed',
				description: `"${title}" has been removed from the modpack.`
			});

			loadModpack(modpack.id);
		} catch (err) {
			console.error('Failed to remove mod:', err);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to remove mod: ${err}`
			});
		} finally {
			setRemovingMod(null);
		}
	};

	const handleToggleMod = async (slug: string, title: string, currentEnabled: boolean) => {
		if (!modpack) return;

		setTogglingMod(slug);
		try {
			const updatedModpack = await invoke<Modpack>('toggle_mod_enabled', {
				slug,
				modpackId: modpack.id
			});

			setModpack(updatedModpack);

			toast({
				title: currentEnabled ? 'Mod disabled' : 'Mod enabled',
				description: `"${title}" has been ${currentEnabled ? 'disabled' : 'enabled'}.`
			});
		} catch (err) {
			console.error('Failed to toggle mod:', err);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to toggle mod: ${err}`
			});
		} finally {
			setTogglingMod(null);
		}
	};

	const handleUpdateMod = async (mod: ModpackMod) => {
		if (!modpack) return;

		const game = games.find((g) => g.id === modpack.game_id);

		setUpdatingMod(mod.slug);
		try {
			const modInfo = await invoke<{
				dependencies: unknown[];
				mod_info: {
					slug: string;
					title: string;
					author: string;
					version_id: string;
					version_number: string;
					icon_url: null | string;
				};
			}>('get_mod_with_dependencies', {
				slug: mod.slug,
				loader: modpack.loader,
				gameVersion: modpack.game_version,
				source: game?.mod_source ?? 'modrinth',
				thunderstoreCommunity: game?.thunderstore_community
			});

			await invoke('remove_mod_from_modpack', {
				slug: mod.slug,
				modpackId: modpack.id
			});

			await invoke('add_mod_to_modpack', {
				filename: null,
				projectId: null,
				modpackId: modpack.id,
				slug: modInfo.mod_info.slug,
				title: modInfo.mod_info.title,
				author: modInfo.mod_info.author,
				iconUrl: modInfo.mod_info.icon_url,
				versionId: modInfo.mod_info.version_id,
				version: modInfo.mod_info.version_number
			});

			toast({
				title: 'Mod updated',
				description: `"${mod.title}" has been updated to v${modInfo.mod_info.version_number}.`
			});

			if (id) {
				loadModpack(id);
				setModUpdates((prev) => {
					const next = { ...prev };
					delete next[mod.slug];
					return next;
				});
			}
		} catch (err) {
			console.error('Failed to update mod:', err);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to update mod: ${err}`
			});
		} finally {
			setUpdatingMod(null);
		}
	};

	const handleUpdateThunderstoreMod = async (updateInfo: ModUpdateInfo) => {
		if (!modpack) return;

		setUpdatingMod(updateInfo.full_name);
		try {
			const result = await invoke<{ success: boolean; error: null | string; to_version: string }>('update_thunderstore_mod', {
				modpackId: modpack.id,
				fullName: updateInfo.full_name
			});

			if (result.success) {
				toast({
					title: 'Mod updated',
					description: `"${updateInfo.display_name}" has been updated to v${result.to_version}.`
				});

				setThunderstoreUpdates((prev) => prev.filter((u) => u.full_name !== updateInfo.full_name));

				if (id) {
					loadModpack(id);
				}
			} else {
				throw new Error(result.error || 'Update failed');
			}
		} catch (err) {
			console.error('Failed to update mod:', err);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to update mod: ${err}`
			});
		} finally {
			setUpdatingMod(null);
		}
	};

	const handleUpdateAllThunderstoreMods = async () => {
		if (!modpack || thunderstoreUpdates.length === 0) return;

		setIsUpdatingAll(true);
		try {
			const result = await invoke<{ success_count: number; failure_count: number }>('update_all_thunderstore_mods', {
				modpackId: modpack.id,
				skipLoaders: true
			});

			if (result.success_count > 0) {
				toast({
					title: 'Mods updated',
					description: `Successfully updated ${result.success_count} mod${result.success_count > 1 ? 's' : ''}.${result.failure_count > 0 ? ` ${result.failure_count} failed.` : ''}`
				});
			} else if (result.failure_count > 0) {
				toast({
					title: 'Update failed',
					variant: 'destructive',
					description: `Failed to update ${result.failure_count} mod${result.failure_count > 1 ? 's' : ''}.`
				});
			}

			setThunderstoreUpdates([]);
			if (id) {
				loadModpack(id);
			}
		} catch (err) {
			console.error('Failed to update all mods:', err);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to update mods: ${err}`
			});
		} finally {
			setIsUpdatingAll(false);
		}
	};

	const handleModsAdded = () => {
		if (id) {
			loadModpack(id);
		}
	};

	const scanForMods = React.useCallback(async (modpackId: string) => {
		setIsScanning(true);
		try {
			const detected = await invoke<DetectedMod[]>('scan_mods_folder', {
				modpackId
			});
			setDetectedMods(detected);
		} catch (err) {
			console.error('Failed to scan mods folder:', err);
		} finally {
			setIsScanning(false);
		}
	}, []);

	React.useEffect(() => {
		const syncAndScan = async () => {
			if (!id || !installStatus?.installed) return;

			try {
				const updatedModpack = await invoke<Modpack>('sync_mod_filenames', {
					modpackId: id
				});
				setModpack(updatedModpack);
			} catch (err) {
				console.error('Failed to sync mod filenames:', err);
			}

			if (modpack?.is_owner) {
				scanForMods(id);
			}
		};

		syncAndScan();
	}, [id, installStatus?.installed, modpack?.is_owner, scanForMods]);

	const handleImportMod = async (mod: DetectedMod) => {
		if (!modpack) return;

		setImportingMod(mod.mod_id);
		try {
			const updatedModpack = await invoke<Modpack>('import_detected_mod', {
				modId: mod.mod_id,
				author: mod.author,
				version: mod.version,
				modpackId: modpack.id,
				filename: mod.filename,
				modrinthSlug: mod.modrinth_slug,
				name: mod.modrinth_title || mod.name,
				modrinthIconUrl: mod.modrinth_icon_url,
				modrinthProjectId: mod.modrinth_project_id
			});

			setModpack(updatedModpack);
			setDetectedMods((prev) => prev.filter((m) => m.mod_id !== mod.mod_id));

			toast({
				title: 'Mod imported',
				description: `"${mod.modrinth_title || mod.name}" has been added to the modpack.`
			});
		} catch (err) {
			console.error('Failed to import mod:', err);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to import mod: ${err}`
			});
		} finally {
			setImportingMod(null);
		}
	};

	const handleLaunch = async () => {
		if (!modpack || !installStatus?.installed) return;

		setIsLaunching(true);
		try {
			await invoke('launch_instance', {
				modpackId: modpack.id
			});
			toast({
				title: 'Game launched',
				description: 'Minecraft is starting...'
			});
		} catch (err) {
			console.error('Failed to launch:', err);
			toast({
				title: 'Launch failed',
				variant: 'destructive',
				description: String(err)
			});
		} finally {
			setIsLaunching(false);
		}
	};

	const handleOpenFolder = async () => {
		if (!modpack) return;

		try {
			await invoke('open_instance_folder', { modpackId: modpack.id });
		} catch (err) {
			console.error('Failed to open folder:', err);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to open folder: ${err}`
			});
		}
	};

	const handleSync = async () => {
		if (!modpack || modpack.is_owner) return;

		const previousModCount = modpack.mods.length;
		const previousName = modpack.name;

		setIsSyncing(true);
		setSyncProgress(null);
		try {
			const updated = await invoke<Modpack>('sync_modpack', {
				modpackId: modpack.id
			});
			setModpack(updated);

			const changes: string[] = [];
			if (updated.name !== previousName) {
				changes.push(`renamed to "${updated.name}"`);
			}
			const modDiff = updated.mods.length - previousModCount;
			if (modDiff > 0) {
				changes.push(`${modDiff} mod${modDiff > 1 ? 's' : ''} added`);
			} else if (modDiff < 0) {
				changes.push(`${Math.abs(modDiff)} mod${Math.abs(modDiff) > 1 ? 's' : ''} removed`);
			}

			setSyncStatus({
				is_synced: true,
				owner_online: true,
				local_mod_count: updated.mods.length,
				remote_mod_count: updated.mods.length
			});

			toast({
				title: 'Sync complete',
				description: changes.length > 0 ? `Updated: ${changes.join(', ')}` : "Already up to date with owner's version."
			});
		} catch (err) {
			console.error('Failed to sync modpack:', err);
			toast({
				title: 'Sync failed',
				description: `${err}`,
				variant: 'destructive'
			});
		} finally {
			setIsSyncing(false);
		}
	};

	const handleClone = async () => {
		if (!modpack) return;

		setIsCloning(true);
		try {
			const cloned = await invoke<Modpack>('clone_modpack', { modpackId: modpack.id });
			toast({
				title: 'Modpack cloned',
				description: `Created "${cloned.name}"`
			});
			navigate(`/modpack/${cloned.id}`);
		} catch (err) {
			console.error('Failed to clone modpack:', err);
			toast({
				title: 'Clone failed',
				description: `${err}`,
				variant: 'destructive'
			});
		} finally {
			setIsCloning(false);
		}
	};

	const getStageLabel = (stage: string): string => {
		switch (stage) {
			case 'downloading_minecraft':
				return 'Downloading Minecraft';
			case 'extracting_natives':
				return 'Extracting Native Libraries';
			case 'installing_loader':
				return 'Installing Mod Loader';
			case 'installing_bepinex':
				return 'Installing BepInEx';
			case 'downloading_mods':
				return 'Downloading Mods';
			case 'complete':
				return 'Complete';
			default:
				return 'Setting up';
		}
	};

	const isInstalling = installStatus?.installing || (installProgress && installProgress.stage !== 'complete');
	const progressPercent = installProgress
		? installProgress.total > 0
			? Math.round((installProgress.current / installProgress.total) * 100)
			: 0
		: 0;

	if (isLoading) {
		return (
			<AppLayout>
				<div className="flex items-center justify-center py-12">
					<Loader2 className="w-8 h-8 animate-spin text-primary" />
				</div>
			</AppLayout>
		);
	}

	if (error || !modpack) {
		return (
			<AppLayout>
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<Package className="w-12 h-12 mb-4 opacity-50" />
					<p className="mb-4">{error || 'Modpack not found'}</p>
					<Button variant="outline" onClick={() => navigate('/modpacks')}>
						<ArrowLeft className="w-4 h-4 mr-2" />
						Back to Modpacks
					</Button>
				</div>
			</AppLayout>
		);
	}

	return (
		<AppLayout>
			<div className="space-y-6">
				<div className="flex items-start gap-4">
					<div className="w-20 h-20 rounded-lg bg-gradient-to-br from-primary/20 via-card to-card flex items-center justify-center shrink-0">
						<Package className="w-10 h-10 text-primary/50" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-bold text-foreground">{modpack.name}</h1>
							{modpack.is_owner ? (
								modpack.share_code ? (
									<Badge variant="outline" className="gap-1 border-primary/50 text-primary bg-primary/10">
										<Wifi className="w-3 h-3" />
										Sharing
									</Badge>
								) : null
							) : (
								<>
									<Badge variant="outline" className="gap-1 border-blue-500/50 text-blue-500 bg-blue-500/10">
										<Users className="w-3 h-3" />
										Joined
									</Badge>
									{!isCheckingSync &&
										syncStatus &&
										!syncStatus.is_synced &&
										(syncStatus.owner_online ? (
											<Badge variant="outline" className="gap-1 border-warning/50 text-warning bg-warning/10">
												<AlertCircle className="w-3 h-3" />
												Out of Sync
											</Badge>
										) : (
											<Badge variant="outline" className="gap-1 border-muted-foreground/50 text-muted-foreground bg-muted">
												<WifiOff className="w-3 h-3" />
												Owner Offline
											</Badge>
										))}
									{isCheckingSync && (
										<Badge variant="outline" className="gap-1 border-muted-foreground/50 text-muted-foreground bg-muted">
											<Loader2 className="w-3 h-3 animate-spin" />
											Checking...
										</Badge>
									)}
									{!isCheckingSync && syncStatus?.is_synced && (
										<Badge variant="outline" className="gap-1 border-primary/50 text-primary bg-primary/10">
											<RefreshCw className="w-3 h-3" />
											Synced
										</Badge>
									)}
								</>
							)}
							{modpack.loader && (
								<Badge variant="secondary" className="capitalize">
									{modpack.loader}
								</Badge>
							)}
						</div>
						<p className="text-muted-foreground text-sm mt-1">
							{modpack.game_version} • {modpack.mods.length} mods
						</p>
						{modpack.description && <p className="text-muted-foreground text-sm mt-2 line-clamp-2">{modpack.description}</p>}
					</div>

					<div className="flex items-center gap-2 shrink-0">
						{modpack.is_owner ? (
							<Button size="icon" variant="outline" title="Share modpack" onClick={() => setShareDialogOpen(true)}>
								<Share2 className="w-4 h-4" />
							</Button>
						) : (
							<>
								<Button variant="outline" className="gap-2" onClick={handleSync} disabled={isSyncing} title="Sync with owner">
									{isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
									Sync
								</Button>
								<Button variant="outline" className="gap-2" onClick={handleClone} disabled={isCloning} title="Clone to own">
									{isCloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
									Clone
								</Button>
							</>
						)}
						<Button size="icon" variant="outline" onClick={handleOpenFolder} title="Open instance folder">
							<FolderOpen className="w-4 h-4" />
						</Button>
						{modpack.is_owner && (
							<Button size="icon" title="Settings" variant="outline" onClick={() => setEditDialogOpen(true)}>
								<Settings className="w-4 h-4" />
							</Button>
						)}
						<Button
							variant="glow"
							className="gap-2"
							onClick={handleLaunch}
							disabled={isLaunching || isInstalling || !installStatus?.installed}
						>
							{isLaunching ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									Launching...
								</>
							) : isInstalling ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									Installing...
								</>
							) : (
								<>
									<Play className="w-4 h-4" />
									Launch
								</>
							)}
						</Button>
					</div>
				</div>
				{isInstalling && (
					<div className="p-4 bg-card border border-border rounded-lg space-y-3">
						<div className="flex items-center gap-3">
							<Download className="w-5 h-5 text-primary animate-pulse" />
							<div className="flex-1">
								<p className="font-medium text-foreground">{installProgress ? getStageLabel(installProgress.stage) : 'Preparing...'}</p>
								<p className="text-sm text-muted-foreground">{installProgress?.message || 'Starting installation...'}</p>
							</div>
						</div>

						<div className="space-y-1">
							<Progress className="h-2" value={progressPercent} />
							<div className="flex justify-between text-xs text-muted-foreground">
								<span>{progressPercent}%</span>
								{installProgress && installProgress.total > 0 && (
									<span>
										{installProgress.current}/{installProgress.total} files
									</span>
								)}
							</div>
						</div>
					</div>
				)}
				{isSyncing && syncProgress && (
					<div className="p-4 bg-primary/5 border border-primary/30 rounded-lg space-y-3">
						<div className="flex items-center gap-3">
							<RefreshCw className="w-5 h-5 text-primary animate-spin" />
							<div className="flex-1">
								<p className="font-medium text-foreground">
									{!syncProgress.action || syncProgress.action === 'starting'
										? 'Starting sync...'
										: `${syncProgress.action.charAt(0).toUpperCase() + syncProgress.action.slice(1)} ${syncProgress.mod_name || ''}`}
								</p>
								<p className="text-sm text-muted-foreground">Syncing with modpack owner</p>
							</div>
						</div>
						{syncProgress.total > 0 && (
							<div className="space-y-1">
								<Progress className="h-2" value={Math.round((syncProgress.current / syncProgress.total) * 100)} />
								<div className="flex justify-between text-xs text-muted-foreground">
									<span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
									<span>
										{syncProgress.current}/{syncProgress.total} mods
									</span>
								</div>
							</div>
						)}
					</div>
				)}
				{installStatus?.installed && !isInstalling && installStatus.last_played && (
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<CheckCircle className="w-3 h-3" />
						<span>Last played {new Date(installStatus.last_played).toLocaleDateString()}</span>
					</div>
				)}
				{detectedMods.length > 0 && (
					<div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Package className="w-5 h-5 text-primary" />
								<div>
									<p className="font-medium text-foreground">
										{detectedMods.length} untracked mod{detectedMods.length > 1 ? 's' : ''} detected
									</p>
									<p className="text-sm text-muted-foreground">Found in mods folder but not in modpack</p>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							{detectedMods.map((mod) => (
								<div key={mod.mod_id} className="flex items-center gap-3 p-2 bg-card border border-border rounded-lg">
									<div className="w-8 h-8 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
										{mod.modrinth_icon_url ? (
											<img alt={mod.name} src={mod.modrinth_icon_url} className="w-full h-full object-cover" />
										) : (
											<Package className="w-4 h-4 text-muted-foreground" />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<p className="font-medium text-sm truncate">{mod.modrinth_title || mod.name}</p>
										<p className="text-xs text-muted-foreground truncate">{mod.filename}</p>
									</div>
									<Button size="sm" variant="outline" onClick={() => handleImportMod(mod)} disabled={importingMod === mod.mod_id}>
										{importingMod === mod.mod_id ? (
											<Loader2 className="w-4 h-4 animate-spin" />
										) : (
											<>
												<Plus className="w-4 h-4 mr-1" />
												Import
											</>
										)}
									</Button>
								</div>
							))}
						</div>
					</div>
				)}
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<h2 className="text-xl font-semibold text-foreground">Mods ({modpack.mods.length})</h2>
							{modpack.is_owner && thunderstoreUpdates.length > 0 && (
								<Badge variant="outline" className="gap-1 border-primary/50 text-primary bg-primary/10">
									{thunderstoreUpdates.length} update{thunderstoreUpdates.length > 1 ? 's' : ''} available
								</Badge>
							)}
							{isCheckingThunderstoreUpdates && (
								<Badge variant="outline" className="gap-1 border-muted-foreground/50 text-muted-foreground bg-muted">
									<Loader2 className="w-3 h-3 animate-spin" />
									Checking...
								</Badge>
							)}
						</div>
						<div className="flex items-center gap-2">
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
								<Input
									type="text"
									placeholder="Search mods..."
									value={modSearch}
									onChange={(e) => setModSearch(e.target.value)}
									className="pl-8 h-9 w-48"
								/>
							</div>
							{thunderstoreUpdates.length > 0 && modpack.is_owner && (
								<Button size="sm" variant="outline" className="gap-2" onClick={handleUpdateAllThunderstoreMods} disabled={isUpdatingAll}>
									{isUpdatingAll ? (
										<>
											<Loader2 className="w-4 h-4 animate-spin" />
											Updating...
										</>
									) : (
										<>
											<Download className="w-4 h-4" />
											Update All ({thunderstoreUpdates.length})
										</>
									)}
								</Button>
							)}
							{modpack.is_owner && (
								<Button size="sm" variant="outline" className="gap-2" onClick={() => setAddModsOpen(true)}>
									<Plus className="w-4 h-4" />
									Add Mods
								</Button>
							)}
						</div>
					</div>

					{modpack.mods.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
							<Package className="w-12 h-12 mb-4 opacity-50" />
							<p className="mb-4">No mods added yet</p>
							{modpack.is_owner ? (
								<Button variant="outline" onClick={() => setAddModsOpen(true)}>
									<Plus className="w-4 h-4 mr-2" />
									Add your first mod
								</Button>
							) : (
								<p className="text-sm">Sync with owner to get mods</p>
							)}
						</div>
					) : (
						<div className="border border-border rounded-lg overflow-hidden bg-card">
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="h-9 px-3 w-[300px]">Name</TableHead>
										<TableHead className="h-9 px-3">Version</TableHead>
										<TableHead className="h-9 px-3 w-[140px] text-right"></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{[...modpack.mods]
										.reverse()
										.filter(
											(mod) =>
												!modSearch ||
												mod.title.toLowerCase().includes(modSearch.toLowerCase()) ||
												mod.author.toLowerCase().includes(modSearch.toLowerCase()) ||
												mod.slug.toLowerCase().includes(modSearch.toLowerCase())
										)
										.map((mod) => (
											<TableRow key={mod.slug} className={`group ${mod.enabled === false ? 'opacity-50' : ''}`}>
												<TableCell>
													<div className="flex items-center gap-3">
														<div className="w-8 h-8 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
															{mod.icon_url ? (
																<img alt={mod.title} src={getIconSrc(mod.icon_url)} className="w-full h-full object-cover" />
															) : (
																<Package className="w-4 h-4 text-muted-foreground" />
															)}
														</div>
														<div className="min-w-0">
															<div className="flex items-center gap-2">
																<p className="font-medium text-sm truncate">{mod.title}</p>
																{mod.is_loader && (
																	<Badge variant="secondary" className="text-xs px-1.5 py-0">
																		Loader
																	</Badge>
																)}
															</div>
															<p className="text-xs text-muted-foreground">by {mod.author}</p>
														</div>
													</div>
												</TableCell>
												<TableCell>
													<div className="space-y-0.5">
														<div className="flex items-center gap-2">
															<p className="text-sm">{mod.version}</p>
															{modpack.is_owner && thunderstoreUpdates.find((u) => u.full_name === mod.slug) && (
																<Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/50 text-primary bg-primary/10">
																	{thunderstoreUpdates.find((u) => u.full_name === mod.slug)?.latest_version} available
																</Badge>
															)}
														</div>
														{mod.filename && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{mod.filename}</p>}
													</div>
												</TableCell>
												<TableCell className="text-right">
													<div className="flex items-center justify-end gap-1">
														{modpack.is_owner && modUpdates[mod.slug] && (
															<Button
																size="icon"
																variant="ghost"
																className="h-8 w-8 text-primary"
																disabled={updatingMod === mod.slug}
																onClick={() => handleUpdateMod(mod)}
																title={`Update to ${modUpdates[mod.slug]}`}
															>
																{updatingMod === mod.slug ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
															</Button>
														)}
														{thunderstoreUpdates.find((u) => u.full_name === mod.slug) && modpack.is_owner && (
															<Button
																size="icon"
																variant="ghost"
																className="h-8 w-8 text-primary"
																disabled={updatingMod === mod.slug || isUpdatingAll}
																onClick={() => {
																	const updateInfo = thunderstoreUpdates.find((u) => u.full_name === mod.slug);
																	if (updateInfo) handleUpdateThunderstoreMod(updateInfo);
																}}
																title={`Update to ${thunderstoreUpdates.find((u) => u.full_name === mod.slug)?.latest_version}`}
															>
																{updatingMod === mod.slug ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
															</Button>
														)}
														<Switch
															checked={mod.enabled !== false}
															disabled={togglingMod === mod.slug || mod.is_loader === true || !modpack.is_owner}
															onCheckedChange={() => handleToggleMod(mod.slug, mod.title, mod.enabled !== false)}
														/>
														{modpack.is_owner && (
															<Button
																size="icon"
																variant="ghost"
																title="Remove mod"
																disabled={removingMod === mod.slug}
																onClick={() => handleRemoveMod(mod.slug, mod.title)}
																className="h-8 w-8 text-destructive hover:text-destructive"
															>
																{removingMod === mod.slug ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
															</Button>
														)}
													</div>
												</TableCell>
											</TableRow>
										))}
								</TableBody>
							</Table>
						</div>
					)}
				</div>
			</div>

			<AddModsDialog
				open={addModsOpen}
				gameId={modpack.game_id}
				modpackId={modpack.id}
				loader={modpack.loader}
				modpackName={modpack.name}
				onOpenChange={setAddModsOpen}
				onModsAdded={handleModsAdded}
				gameVersion={modpack.game_version}
				existingMods={modpack.mods.map((m) => m.slug)}
			/>

			{modpack.is_owner && (
				<ShareModpackDialog
					open={shareDialogOpen}
					modpackId={modpack.id}
					modpackName={modpack.name}
					onOpenChange={setShareDialogOpen}
					currentShareCode={modpack.share_code}
					onShareStatusChange={() => loadModpack(modpack.id)}
				/>
			)}

			<EditModpackDialog
				open={editDialogOpen}
				modpackId={modpack.id}
				modpackName={modpack.name}
				onOpenChange={setEditDialogOpen}
				modpackImagePath={modpack.image_path}
				onSave={() => loadModpack(modpack.id)}
				modpackVersion={modpack.game_version}
			/>
		</AppLayout>
	);
}
