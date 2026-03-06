import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { Progress } from '~/components/ui/progress';
import { AlertCircle, CheckCircle, Download, Loader2, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { InstallDialogProps, InstallProgress } from './types';

export function InstallDialog({ open, modpackId, modpackName, onOpenChange, onInstallComplete }: InstallDialogProps) {
	const [isInstalling, setIsInstalling] = React.useState(false);
	const [progress, setProgress] = React.useState<null | InstallProgress>(null);
	const [error, setError] = React.useState<null | string>(null);

	React.useEffect(() => {
		if (!open) {
			setProgress(null);
			setError(null);
			return;
		}

		const unlisten = listen<InstallProgress>('install-progress', (event) => {
			setProgress(event.payload);
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [open]);

	const handleInstall = async () => {
		setIsInstalling(true);
		setError(null);

		try {
			await invoke('install_instance', { modpackId });

			toast({
				title: 'Installation complete',
				description: `"${modpackName}" is ready to play!`
			});

			onInstallComplete?.();
			onOpenChange(false);
		} catch (err) {
			console.error('Installation failed:', err);
			setError(String(err));
			toast({
				variant: 'destructive',
				description: String(err),
				title: 'Installation failed'
			});
		} finally {
			setIsInstalling(false);
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
			case 'downloading_mods':
				return 'Downloading Mods';
			case 'complete':
				return 'Installation Complete';
			default:
				return 'Installing';
		}
	};

	const getStageIcon = (stage: string) => {
		if (stage === 'complete') {
			return <CheckCircle className="w-5 h-5 text-primary" />;
		}
		return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
	};

	const progressPercent = progress ? (progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0) : 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Download className="w-5 h-5 text-primary" />
						Install "{modpackName}"
					</DialogTitle>
					<DialogDescription>
						{isInstalling
							? 'Downloading and installing Minecraft, mod loader, and mods...'
							: 'This will download Minecraft, the mod loader, and all mods for this modpack.'}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 mt-4">
					{!isInstalling && !error && (
						<>
							<div className="p-4 bg-muted/50 rounded-lg space-y-2">
								<div className="flex items-center gap-2 text-sm">
									<Package className="w-4 h-4 text-muted-foreground" />
									<span>Minecraft client and assets</span>
								</div>
								<div className="flex items-center gap-2 text-sm">
									<Package className="w-4 h-4 text-muted-foreground" />
									<span>Mod loader (Fabric)</span>
								</div>
								<div className="flex items-center gap-2 text-sm">
									<Package className="w-4 h-4 text-muted-foreground" />
									<span>All mods in the modpack</span>
								</div>
							</div>
							<p className="text-xs text-muted-foreground">This may take a few minutes depending on your internet connection.</p>
							<Button variant="glow" className="w-full" onClick={handleInstall}>
								<Download className="w-4 h-4 mr-2" />
								Start Installation
							</Button>
						</>
					)}

					{isInstalling && progress && (
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								{getStageIcon(progress.stage)}
								<span className="font-medium">{getStageLabel(progress.stage)}</span>
							</div>

							<div className="space-y-2">
								<Progress className="h-2" value={progressPercent} />
								<div className="flex justify-between text-xs text-muted-foreground">
									<span>{progress.message}</span>
									<span>
										{progress.current}/{progress.total}
									</span>
								</div>
							</div>

							<p className="text-xs text-muted-foreground text-center">Please wait while the installation completes...</p>
						</div>
					)}

					{error && (
						<div className="space-y-4">
							<div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
								<div className="flex items-center gap-2 text-destructive mb-2">
									<AlertCircle className="w-4 h-4" />
									<span className="font-medium">Installation Failed</span>
								</div>
								<p className="text-sm text-muted-foreground">{error}</p>
							</div>
							<div className="flex gap-2">
								<Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
									Close
								</Button>
								<Button variant="glow" className="flex-1" onClick={handleInstall}>
									Retry
								</Button>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
