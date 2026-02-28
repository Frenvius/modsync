import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { relaunch } from '@tauri-apps/plugin-process';
import { Card, CardContent } from '@/components/ui/card';
import { Lock, Loader2, Package, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import SyncStatus from '~/components/SyncStatus';
import { stateService } from '~/services/state.service';
import { AppStateContext } from '~/context/AppState/constants';
import { ModEntry, syncService } from '~/services/sync.service';
import { PackageInfo, thunderstoreService } from '~/services/thunderstore.service';

interface ModWithInfo extends ModEntry {
	packageInfo?: null | PackageInfo;
}

const ManageProfile = () => {
	const {
		update,
		hostPort,
		isHosting,
		modpackId,
		appVersion,
		isReadOnly,
		syncStatus,
		modpackName,
		hostAddress,
		isInstalled,
		setSyncStatus,
		activeTmmProfile
	} = React.useContext(AppStateContext);

	const [mods, setMods] = React.useState<ModWithInfo[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);

	React.useEffect(() => {
		const loadMods = async () => {
			if (!activeTmmProfile) {
				setMods([]);
				return;
			}

			setIsLoading(true);
			try {
				const modpack = await syncService.scanLocalMods(modpackName || activeTmmProfile, modpackId || '');

				const thunderstoreIds = modpack.mods.map((mod) => mod.thunderstore_id).filter((id): id is string => !!id);

				let packageMap: Record<string, PackageInfo> = {};
				if (thunderstoreIds.length > 0) {
					try {
						packageMap = await thunderstoreService.getPackagesBulk('valheim', thunderstoreIds);
					} catch {}
				}

				const modsWithInfo: ModWithInfo[] = modpack.mods.map((mod) => ({
					...mod,
					packageInfo: mod.thunderstore_id ? packageMap[mod.thunderstore_id] || null : null
				}));

				setMods(modsWithInfo);
			} catch (err) {
				console.error('Failed to load mods:', err);
				setMods([]);
			} finally {
				setIsLoading(false);
			}
		};

		loadMods();
	}, [activeTmmProfile, modpackName, modpackId]);

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

	const hasUpdate = update?.currentVersion !== update?.version;

	const handleUpdate = async () => {
		await update?.downloadAndInstall();
		await relaunch();
	};

	const getModDisplayName = (mod: ModWithInfo): string => {
		if (mod.name) return mod.name;
		if (mod.packageInfo?.name) return mod.packageInfo.name;
		return mod.filename.replace('.dll', '');
	};

	const getModAuthor = (mod: ModWithInfo): string => {
		if (mod.author) return mod.author;
		if (mod.packageInfo?.owner) return mod.packageInfo.owner;
		return 'Unknown';
	};

	const getModVersion = (mod: ModWithInfo): string => {
		if (mod.thunderstore_version) return mod.thunderstore_version;
		const parts = mod.filename.replace('.dll', '').split('-');
		if (parts.length >= 3) return parts[2];
		return '';
	};

	if (!activeTmmProfile) {
		return (
			<div className="flex flex-col h-full items-center justify-center text-muted-foreground">
				<Package className="h-12 w-12 mb-4" />
				<h2 className="text-xl font-semibold text-foreground mb-2">No Profile Selected</h2>
				<p className="text-sm mb-4">Select a profile from the dropdown above to manage your mods</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full gap-4">
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold text-foreground">{activeTmmProfile}</h1>
						{isReadOnly && (
							<Tooltip>
								<TooltipTrigger asChild>
									<div className="flex items-center gap-1 text-yellow-500">
										<Lock className="w-4 h-4" />
										<span className="text-xs font-medium">Read-only</span>
									</div>
								</TooltipTrigger>
								<TooltipContent>You are synced to someone else's modpack</TooltipContent>
							</Tooltip>
						)}
					</div>
					<p className="text-sm text-muted-foreground">{isLoading ? 'Loading...' : `${mods.length} mods installed`}</p>
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

			<div className="flex-1 min-h-0 overflow-y-auto">
				{isLoading ? (
					<div className="flex items-center justify-center h-48">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : mods.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
						<Package className="h-12 w-12 mb-2" />
						<p className="mb-2">No mods installed</p>
						<Link to="/browse">
							<Button size="sm" variant="outline">
								Browse Mods
							</Button>
						</Link>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
						{mods.map((mod, index) => (
							<Card className="glass" key={mod.path || index}>
								<CardContent className="p-3">
									<div className="flex gap-3">
										<img
											loading="lazy"
											alt={getModDisplayName(mod)}
											src={mod.packageInfo?.icon || ''}
											className="w-12 h-12 rounded-lg object-cover bg-muted shrink-0"
											onError={(e) => {
												(e.target as HTMLImageElement).src =
													'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect fill="%23333" width="48" height="48" rx="8"/><text x="24" y="30" text-anchor="middle" fill="%23666" font-size="18">?</text></svg>';
											}}
										/>
										<div className="flex-1 min-w-0">
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<h3 className="font-medium text-sm text-foreground truncate">{getModDisplayName(mod)}</h3>
													<p className="text-xs text-muted-foreground truncate">by {getModAuthor(mod)}</p>
												</div>
												{mod.thunderstore_id && (
													<a
														target="_blank"
														rel="noopener noreferrer"
														className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
														href={`https://thunderstore.io/c/valheim/p/${mod.thunderstore_id.replace('-', '/')}/`}
													>
														<ExternalLink className="h-4 w-4" />
													</a>
												)}
											</div>
											<div className="flex items-center gap-2 mt-1">
												{getModVersion(mod) && <span className="text-xs text-muted-foreground">v{getModVersion(mod)}</span>}
												{mod.is_custom && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">Custom</span>}
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default ManageProfile;
