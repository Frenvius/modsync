import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, HardDrive } from 'lucide-react';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '@/components/ui/card';

import { useToast } from '~/components/Toast';
import { formatBytes } from '~/usecase/utils/stringUtils';
import { AppStateContext } from '~/context/AppState/constants';

interface CacheStats {
	total_size: number;
	entry_count: number;
	oldest_entry: null | number;
	newest_entry: null | number;
}


interface SettingsProps {
	refresh?: boolean;
}

const Settings = ({ refresh }: SettingsProps) => {
	const navigate = useNavigate();
	const toast = useToast();
	const { config, hostPort, setConfig } = React.useContext(AppStateContext);
	const [publicIp, setPublicIp] = React.useState<string>(config.publicIp || '');
	const [port, setPort] = React.useState<number>(hostPort || 7878);
	const [isLoading, setIsLoading] = React.useState<boolean>(false);
	const [cacheStats, setCacheStats] = React.useState<null | CacheStats>(null);
	const [isClearingCache, setIsClearingCache] = React.useState<boolean>(false);

	const loadCacheStats = async () => {
		try {
			const stats = await invoke<CacheStats>('get_cache_stats_cmd');
			setCacheStats(stats);
		} catch (err) {
			console.error('Failed to load cache stats:', err);
		}
	};

	React.useEffect(() => {
		loadCacheStats();
	}, []);

	const handleClearCache = async () => {
		setIsClearingCache(true);
		try {
			const clearedSize = await invoke<number>('clear_cache_cmd');
			toast.success('Cache cleared', `Freed ${formatBytes(clearedSize)}`);
			await loadCacheStats();
		} catch (err) {
			toast.error('Failed to clear cache', String(err));
		} finally {
			setIsClearingCache(false);
		}
	};

	const handlePublicIpChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setPublicIp(event.target.value);
	};

	const handlePortChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setPort(Number(event.target.value));
	};

	const saveSettings = async () => {
		setIsLoading(true);
		await setConfig('publicIp', publicIp);
		await setConfig('hostPort', port);
		navigate('/');
		refresh && navigate(0);
	};

	return (
		<div className="flex flex-col h-full gap-6 pl-6 pt-6">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Settings</h1>
				<p className="text-sm text-muted-foreground">Configure your mod updater preferences</p>
			</div>

			<Card className="glass">
				<CardHeader>
					<CardTitle className="text-lg">Network Settings</CardTitle>
					<CardDescription>Configure sharing and connection settings</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-12 gap-4">
						<div className="col-span-8 space-y-2">
							<Label htmlFor="publicIp">Public IP</Label>
							<Input id="publicIp" value={publicIp} disabled={isLoading} placeholder="123.45.67.89" onChange={handlePublicIpChange} />
						</div>
						<div className="col-span-4 space-y-2">
							<Label htmlFor="port">Port</Label>
							<Input id="port" value={port} type="number" disabled={isLoading} onChange={handlePortChange} />
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="glass">
				<CardHeader>
					<CardTitle className="text-lg">Download Cache</CardTitle>
					<CardDescription>Manage cached mod downloads</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<HardDrive className="h-8 w-8 text-muted-foreground" />
							<div>
								<p className="font-medium">
									{cacheStats ? formatBytes(cacheStats.total_size) : 'Loading...'}
								</p>
								<p className="text-sm text-muted-foreground">
									{cacheStats ? `${cacheStats.entry_count} cached mods` : ''}
								</p>
							</div>
						</div>
						<Button
							size="sm"
							variant="destructive"
							onClick={handleClearCache}
							disabled={isClearingCache || !cacheStats || cacheStats.entry_count === 0}
						>
							{isClearingCache ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="mr-2 h-4 w-4" />
							)}
							Clear Cache
						</Button>
					</div>
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button size="lg" variant="glow" disabled={isLoading} onClick={async () => await saveSettings()}>
					{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					Save Settings
				</Button>
			</div>
		</div>
	);
};

export default Settings;
