import React from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { relaunch } from '@tauri-apps/plugin-process';
import { X, Lock, Search, Loader2, Package, ArrowUpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useToast } from '~/components/Toast';
import SyncStatus from '~/components/SyncStatus';
import { stateService } from '~/services/state.service';
import ModDetailPanel from '~/components/ModDetailPanel';
import { ProfileMod, ModUpdateInfo } from '~/types/profile';
import { profileService } from '~/services/profile.service';
import { AppStateContext } from '~/context/AppState/constants';
import { ModEntry, syncService } from '~/services/sync.service';
import { PackageInfo, thunderstoreService } from '~/services/thunderstore.service';

interface ModWithInfo extends ModEntry {
	enabled: boolean;
	hasUpdate?: boolean;
	latestVersion?: string;
	packageInfo?: null | PackageInfo;
}

interface ProfileModCache {
	cachedAt: number;
	mods: ModWithInfo[];
	isPendingInstall: boolean;
}

const PROFILE_MOD_CACHE_TTL_MS = 2 * 60 * 1000;
const _profileModCache = new Map<string, ProfileModCache>();

const profileModToModEntry = (profileMod: ProfileMod): ModWithInfo => {
	const isThunderstore = profileMod.kind.type === 'thunderstore';
	const dashIndex = profileMod.packageId.indexOf('-');
	const author = dashIndex > 0 ? profileMod.packageId.slice(0, dashIndex) : null;
	const name = dashIndex > 0 ? profileMod.packageId.slice(dashIndex + 1) : profileMod.packageId;

	return {
		name,
		author,
		size: 0,
		path: '',
		sha256: '',
		is_custom: !isThunderstore,
		enabled: profileMod.enabled,
		filename: `${profileMod.packageId}.dll`,
		thunderstore_version: profileMod.version || null,
		thunderstore_id: isThunderstore ? profileMod.packageId : null
	};
};

async function persistModsToYml(profileId: string, mods: ModWithInfo[], _isPending: boolean): Promise<void> {
	if (mods.length === 0) return;
	try {
		const ymlMods = mods.map((mod) => ({
			enabled: mod.enabled,
			isLocal: mod.is_custom,
			displayName: mod.name || null,
			iconUrl: mod.packageInfo?.icon || null,
			version: mod.thunderstore_version || '',
			installTime: Math.floor(Date.now() / 1000),
			author: mod.author || mod.packageInfo?.owner || null,
			packageId: mod.thunderstore_id || mod.filename.replace('.dll', '')
		}));
		await profileService.updateProfileModsYml(profileId, ymlMods);
	} catch {}
}

async function refreshModsYmlInBackground(profileId: string, modpackName: string, modpackId: string): Promise<void> {
	try {
		const modpack = await syncService.scanLocalMods(modpackName, modpackId);
		if (modpack.mods.length === 0) return;

		const thunderstoreIds = modpack.mods.map((m) => m.thunderstore_id).filter((id): id is string => !!id);
		let packageMap: Record<string, PackageInfo> = {};
		if (thunderstoreIds.length > 0) {
			try {
				packageMap = await thunderstoreService.getPackagesBulk('valheim', thunderstoreIds);
			} catch {}
		}

		const refreshedMods: ModWithInfo[] = modpack.mods.map((mod) => ({
			...mod,
			enabled: true,
			is_custom: !mod.thunderstore_id || !packageMap[mod.thunderstore_id],
			packageInfo: mod.thunderstore_id ? packageMap[mod.thunderstore_id] || null : null
		}));

		_profileModCache.set(profileId, { mods: refreshedMods, cachedAt: Date.now(), isPendingInstall: false });
		persistModsToYml(profileId, refreshedMods, false);
	} catch {}
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
		activeGame,
		modpackName,
		hostAddress,
		isInstalled,
		setSyncStatus,
		activeProfile
	} = React.useContext(AppStateContext);

	const toast = useToast();

	const [mods, setMods] = React.useState<ModWithInfo[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isPendingInstall, setIsPendingInstall] = React.useState(false);
	const [search, setSearch] = React.useState('');
	const [typeFilter, setTypeFilter] = React.useState<'all' | 'custom' | 'thunderstore'>('all');
	const [selectedMod, setSelectedMod] = React.useState<null | ModWithInfo>(null);

	const [modsWithUpdates, setModsWithUpdates] = React.useState<ModUpdateInfo[]>([]);
	const [updatingMods, setUpdatingMods] = React.useState<Set<string>>(new Set());
	const [isUpdatingAll, setIsUpdatingAll] = React.useState(false);
	const [dismissedUpdateBanner, setDismissedUpdateBanner] = React.useState(false);
	const [updateProgress, setUpdateProgress] = React.useState<null | { total: number; current: number; modName: string }>(null);
	const updateCheckedProfileId = React.useRef<null | string>(null);

	React.useEffect(() => {
		const loadMods = async () => {
			if (!activeProfile) {
				setMods([]);
				return;
			}

			const cached = _profileModCache.get(activeProfile.id);
			if (cached && Date.now() - cached.cachedAt < PROFILE_MOD_CACHE_TTL_MS) {
				setMods(cached.mods);
				setIsPendingInstall(cached.isPendingInstall);
				return;
			}

			setIsLoading(true);
			setIsPendingInstall(false);
			try {
				const ymlMods = await profileService.getProfileModsFast(activeProfile.id);

				if (ymlMods.length > 0) {
					const modsFromYml: ModWithInfo[] = ymlMods.map((m) => ({
						size: 0,
						path: '',
						sha256: '',
						enabled: m.enabled,
						is_custom: m.isLocal,
						author: m.author || null,
						filename: `${m.packageId}.dll`,
						name: m.displayName || m.packageId,
						thunderstore_version: m.version || null,
						thunderstore_id: m.isLocal ? null : m.packageId,
						packageInfo: m.iconUrl
							? {
									rating: 0,
									downloads: 0,
									categories: [],
									icon: m.iconUrl,
									description: '',
									date_updated: '',
									dependencies: [],
									version: m.version,
									is_deprecated: false,
									owner: m.author || '',
									full_name: m.packageId,
									name: m.displayName || m.packageId
								}
							: null
					}));

					setMods(modsFromYml);
					_profileModCache.set(activeProfile.id, { mods: modsFromYml, cachedAt: Date.now(), isPendingInstall: false });

					refreshModsYmlInBackground(activeProfile.id, modpackName || activeProfile.name, modpackId || '');
					return;
				}

				const modpack = await syncService.scanLocalMods(modpackName || activeProfile.name, modpackId || '');

				let finalMods: ModWithInfo[];
				let isPending = false;

				if (modpack.mods.length === 0 && activeProfile.mods.length > 0) {
					isPending = true;
					const dbMods = activeProfile.mods.filter((m) => m.enabled).map(profileModToModEntry);
					const thunderstoreIds = dbMods.map((m) => m.thunderstore_id).filter((id): id is string => !!id);
					let packageMap: Record<string, PackageInfo> = {};
					if (thunderstoreIds.length > 0) {
						try {
							packageMap = await thunderstoreService.getPackagesBulk('valheim', thunderstoreIds);
						} catch {}
					}
					finalMods = dbMods.map((mod) => ({
						...mod,
						packageInfo: mod.thunderstore_id ? packageMap[mod.thunderstore_id] || null : null
					}));
				} else {
					const thunderstoreIds = modpack.mods.map((mod) => mod.thunderstore_id).filter((id): id is string => !!id);
					let packageMap: Record<string, PackageInfo> = {};
					if (thunderstoreIds.length > 0) {
						try {
							packageMap = await thunderstoreService.getPackagesBulk('valheim', thunderstoreIds);
						} catch {}
					}
					finalMods = modpack.mods.map((mod) => ({
						...mod,
						enabled: true,
						packageInfo: mod.thunderstore_id ? packageMap[mod.thunderstore_id] || null : null
					}));
				}

				setIsPendingInstall(isPending);
				setMods(finalMods);

				_profileModCache.set(activeProfile.id, { mods: finalMods, cachedAt: Date.now(), isPendingInstall: isPending });
				persistModsToYml(activeProfile.id, finalMods, isPending);
			} catch (err) {
				console.error('Failed to load mods:', err);
				setMods([]);
			} finally {
				setIsLoading(false);
			}
		};

		loadMods();
	}, [activeProfile?.id, modpackName, modpackId]);

	React.useEffect(() => {
		updateCheckedProfileId.current = null;
		setModsWithUpdates([]);
		setDismissedUpdateBanner(false);
		setUpdatingMods(new Set());
	}, [activeProfile?.id]);

	React.useEffect(() => {
		if (isLoading || !activeProfile || mods.length === 0) return;
		if (updateCheckedProfileId.current === activeProfile.id) return;
		updateCheckedProfileId.current = activeProfile.id;

		(async () => {
			try {
				const updates = await profileService.checkProfileUpdates(activeProfile.id, activeGame || 'valheim');
				const updatable = updates.filter((u) => u.hasUpdate);
				if (updatable.length > 0) {
					setModsWithUpdates(updatable);
					const updateMap = new Map(updatable.map((u) => [u.packageId, u]));
					setMods((prev) =>
						prev.map((mod) => {
							if (!mod.thunderstore_id) return mod;
							const info = updateMap.get(mod.thunderstore_id);
							return info ? { ...mod, hasUpdate: true, latestVersion: info.latestVersion } : mod;
						})
					);
				}
			} catch {}
		})();
	}, [isLoading, activeProfile?.id]);

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

	const handleToggleEnabled = async (mod: ModWithInfo) => {
		if (!activeProfile) return;
		const packageId = mod.thunderstore_id || mod.filename.replace('.dll', '');
		const newEnabled = !mod.enabled;

		setMods((prev) => prev.map((m) => (m === mod ? { ...m, enabled: newEnabled } : m)));
		try {
			await profileService.setModEnabled(activeProfile.id, packageId, newEnabled);
			_profileModCache.delete(activeProfile.id);
		} catch (err) {
			setMods((prev) => prev.map((m) => (m === mod ? { ...m, enabled: mod.enabled } : m)));
			toast.error('Failed to toggle mod', String(err));
		}
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

	const handleUpdateMod = async (mod: ModWithInfo, e: React.MouseEvent) => {
		e.stopPropagation();
		if (!activeProfile || !mod.latestVersion || !mod.thunderstore_id) return;
		const packageId = mod.thunderstore_id;
		setUpdatingMods((prev) => new Set(prev).add(packageId));
		try {
			await profileService.updateMod(activeProfile.id, packageId, mod.latestVersion, activeGame || 'valheim');
			setMods((prev) => prev.map((m) => (m === mod ? { ...m, hasUpdate: false, thunderstore_version: mod.latestVersion } : m)));
			setModsWithUpdates((prev) => prev.filter((u) => u.packageId !== packageId));
			_profileModCache.delete(activeProfile.id);
			toast.success(`Updated ${getModDisplayName(mod)}`, `Updated to v${mod.latestVersion}`);
		} catch (err) {
			toast.error(`Failed to update ${getModDisplayName(mod)}`, String(err));
		} finally {
			setUpdatingMods((prev) => {
				const next = new Set(prev);
				next.delete(packageId);
				return next;
			});
		}
	};

	const handleUpdateAll = async () => {
		if (!activeProfile || modsWithUpdates.length === 0) return;
		setIsUpdatingAll(true);
		setUpdateProgress(null);

		const unlisten = await listen<{ total: number; phase: string; current: number; mod_name: string }>('mod_update_progress', (event) => {
			setUpdateProgress({ total: event.payload.total, current: event.payload.current, modName: event.payload.mod_name });
		});

		try {
			const failedIds = await profileService.updateAllMods(activeProfile.id, activeGame || 'valheim', modsWithUpdates);
			const failedSet = new Set(failedIds);
			const updateMap = new Map(modsWithUpdates.map((u) => [u.packageId, u]));
			setMods((prev) =>
				prev.map((mod) => {
					if (!mod.thunderstore_id) return mod;
					const upd = updateMap.get(mod.thunderstore_id);
					if (upd && !failedSet.has(mod.thunderstore_id)) {
						return { ...mod, hasUpdate: false, thunderstore_version: upd.latestVersion };
					}
					return mod;
				})
			);
			setModsWithUpdates((prev) => prev.filter((u) => failedSet.has(u.packageId)));
			_profileModCache.delete(activeProfile.id);
			const succeededCount = modsWithUpdates.length - failedIds.length;
			if (failedIds.length > 0) {
				toast.error(`${failedIds.length} update(s) failed`, `${succeededCount} mod(s) updated`);
			} else {
				toast.success('All mods updated', `${succeededCount} mod(s) updated`);
				setDismissedUpdateBanner(true);
			}
		} catch (err) {
			toast.error('Failed to update mods', String(err));
		} finally {
			unlisten();
			setIsUpdatingAll(false);
			setUpdateProgress(null);
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

	const filteredMods = React.useMemo(() => {
		const q = search.trim().toLowerCase();
		return mods.filter((mod) => {
			if (typeFilter === 'thunderstore' && mod.is_custom) return false;
			if (typeFilter === 'custom' && !mod.is_custom) return false;
			if (q) {
				const name = getModDisplayName(mod).toLowerCase();
				const author = getModAuthor(mod).toLowerCase();
				return name.includes(q) || author.includes(q);
			}
			return true;
		});
	}, [mods, search, typeFilter]);

	if (!activeProfile) {
		return (
			<div className="flex flex-col h-full items-center justify-center text-muted-foreground pl-6 pt-6">
				<Package className="h-12 w-12 mb-4" />
				<h2 className="text-xl font-semibold text-foreground mb-2">No Profile Selected</h2>
				<p className="text-sm mb-4">Create or select a profile from the dropdown above to manage your mods</p>
			</div>
		);
	}

	return (
		<div className="flex h-full overflow-hidden">
			<div className="flex flex-col flex-1 min-w-0 overflow-hidden pt-4">
				<div className="flex items-center justify-between px-6 mb-4">
					<div>
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold text-foreground">{activeProfile.name}</h1>
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
						<p className="text-sm text-muted-foreground">
							{isLoading
								? 'Loading...'
								: isPendingInstall
									? `${mods.length} mods registered (not yet downloaded)`
									: `${mods.length} mods installed`}
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

				{modsWithUpdates.length > 0 && !dismissedUpdateBanner && (
					<div className="flex items-center gap-2 shrink-0 px-6 py-2 mb-2 bg-blue-500/10 border-y border-blue-500/20">
						<ArrowUpCircle className="h-4 w-4 text-blue-400 shrink-0" />
						<span className="text-sm text-blue-400">
							{isUpdatingAll && updateProgress
								? `Updating ${updateProgress.current}/${updateProgress.total}: ${updateProgress.modName}`
								: `${modsWithUpdates.length} update${modsWithUpdates.length !== 1 ? 's' : ''} available`}
						</span>
						<div className="ml-auto flex items-center gap-2">
							{isUpdatingAll && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />}
							<button
								disabled={isUpdatingAll}
								onClick={() => setDismissedUpdateBanner(true)}
								className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
							>
								Dismiss
							</button>
							<Button size="sm" className="h-7 text-xs" disabled={isUpdatingAll} onClick={handleUpdateAll}>
								Update All
							</Button>
						</div>
					</div>
				)}

				{!isLoading && mods.length > 0 && (
					<div className="flex items-center gap-2 shrink-0 px-6 mb-4">
						<div className="relative flex-1">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
							<Input value={search} placeholder="Search mods..." className="pl-8 h-8 text-sm" onChange={(e) => setSearch(e.target.value)} />
							{search && (
								<button
									onClick={() => setSearch('')}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								>
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</div>
						<div className="flex items-center gap-1 text-xs shrink-0">
							{(['all', 'thunderstore', 'custom'] as const).map((f) => (
								<button
									key={f}
									onClick={() => setTypeFilter(f)}
									className={`px-2.5 py-1 rounded capitalize transition-colors ${
										typeFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
									}`}
								>
									{f}
								</button>
							))}
						</div>
					</div>
				)}

				<div className="flex-1 min-h-0 overflow-y-auto px-6">
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
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border text-muted-foreground text-xs">
									<th className="text-left font-medium pb-2 pl-1">Mod</th>
									<th className="text-left font-medium pb-2">Author</th>
									<th className="text-left font-medium pb-2">Version</th>
									<th className="w-10 pb-2"></th>
								</tr>
							</thead>
							<tbody>
								{filteredMods.length === 0 && (
									<tr>
										<td colSpan={4} className="py-12 text-center text-muted-foreground text-sm">
											No mods match your search
										</td>
									</tr>
								)}
								{filteredMods.map((mod, index) => (
									<tr
										key={mod.path || index}
										onClick={() => setSelectedMod((prev) => (prev === mod ? null : mod))}
										className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${selectedMod === mod ? 'bg-muted/50' : ''} ${!mod.enabled ? 'opacity-50' : ''}`}
									>
										<td className="py-2 pl-1">
											<div className="flex items-center gap-2">
												<img
													loading="lazy"
													alt={getModDisplayName(mod)}
													src={mod.packageInfo?.icon || ''}
													className="w-7 h-7 rounded object-cover bg-muted shrink-0"
													onError={(e) => {
														(e.target as HTMLImageElement).src =
															'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect fill="%23333" width="28" height="28" rx="4"/><text x="14" y="19" text-anchor="middle" fill="%23666" font-size="12">?</text></svg>';
													}}
												/>
												<span className="font-medium text-foreground truncate">{getModDisplayName(mod)}</span>
												{mod.is_custom && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded shrink-0">Custom</span>}
											</div>
										</td>
										<td className="py-2 text-muted-foreground">{getModAuthor(mod)}</td>
										<td className="py-2 text-muted-foreground">
											<div className="flex items-center gap-1.5">
												<span>{getModVersion(mod) ? `v${getModVersion(mod)}` : '—'}</span>
												{mod.thunderstore_id && updatingMods.has(mod.thunderstore_id) ? (
													<Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />
												) : mod.hasUpdate ? (
													<Tooltip>
														<TooltipTrigger asChild>
															<button onClick={(e) => handleUpdateMod(mod, e)} className="text-blue-400 hover:text-blue-300 shrink-0">
																<ArrowUpCircle className="h-3.5 w-3.5" />
															</button>
														</TooltipTrigger>
														<TooltipContent side="top">Update to v{mod.latestVersion}</TooltipContent>
													</Tooltip>
												) : null}
											</div>
										</td>
										<td className="py-2 pr-2 w-10 text-right">
											<Switch checked={mod.enabled} onCheckedChange={() => handleToggleEnabled(mod)} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>
			{selectedMod && (
				<ModDetailPanel
					mode="installed"
					mod={selectedMod}
					getAuthor={getModAuthor}
					getVersion={getModVersion}
					getDisplayName={getModDisplayName}
					onClose={() => setSelectedMod(null)}
				/>
			)}
		</div>
	);
};

export default ManageProfile;
