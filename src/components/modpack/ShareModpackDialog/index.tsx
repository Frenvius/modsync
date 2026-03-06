import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { Check, Copy, Loader2, Wifi, WifiOff } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { ShareModpackDialogProps } from './types';

export function ShareModpackDialog({
	open,
	modpackId,
	modpackName,
	onOpenChange,
	currentShareCode,
	onShareStatusChange
}: ShareModpackDialogProps) {
	const [port, setPort] = React.useState('7878');
	const [shareCode, setShareCode] = React.useState<null | string>(currentShareCode || null);
	const [isSharing, setIsSharing] = React.useState(!!currentShareCode);
	const [isLoading, setIsLoading] = React.useState(false);
	const [copied, setCopied] = React.useState(false);

	React.useEffect(() => {
		const checkServerStatus = async () => {
			if (open && currentShareCode) {
				try {
					const isRunning = await invoke<boolean>('get_sharing_status');
					if (!isRunning) {
						await invoke('stop_sharing', { modpackId });
						setShareCode(null);
						setIsSharing(false);
						onShareStatusChange?.();
					} else {
						setShareCode(currentShareCode);
						setIsSharing(true);
					}
				} catch (err) {
					console.error('Failed to check sharing status:', err);
				}
			} else {
				setShareCode(currentShareCode || null);
				setIsSharing(!!currentShareCode);
			}
		};
		checkServerStatus();
	}, [open, currentShareCode, modpackId, onShareStatusChange]);

	const handleStartSharing = async () => {
		const portNum = parseInt(port);
		if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
			toast({
				title: 'Invalid port',
				variant: 'destructive',
				description: 'Please enter a valid port number (1-65535).'
			});
			return;
		}

		setIsLoading(true);
		try {
			const code = await invoke<string>('begin_sharing', {
				modpackId,
				port: portNum
			});

			setShareCode(code);
			setIsSharing(true);
			onShareStatusChange?.();

			toast({
				title: 'Sharing started',
				description: 'Your modpack is now being shared. Send the code to your friends!'
			});
		} catch (error) {
			console.error('Failed to start sharing:', error);
			toast({
				variant: 'destructive',
				description: String(error),
				title: 'Failed to start sharing'
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleStopSharing = async () => {
		setIsLoading(true);
		try {
			await invoke('stop_sharing', { modpackId });

			setShareCode(null);
			setIsSharing(false);
			onShareStatusChange?.();

			toast({
				title: 'Sharing stopped',
				description: 'Your modpack is no longer being shared.'
			});
		} catch (error) {
			console.error('Failed to stop sharing:', error);
			toast({
				variant: 'destructive',
				description: String(error),
				title: 'Failed to stop sharing'
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleCopy = () => {
		if (shareCode) {
			navigator.clipboard.writeText(shareCode);
			setCopied(true);
			toast({
				title: 'Code copied!',
				description: 'Share this code with your friends.'
			});
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{isSharing ? <Wifi className="w-5 h-5 text-primary" /> : <WifiOff className="w-5 h-5 text-muted-foreground" />}
						Share "{modpackName}"
					</DialogTitle>
					<DialogDescription>
						{isSharing
							? 'Your modpack is being shared. Friends can join using the code below.'
							: 'Start sharing to let friends join your modpack.'}
					</DialogDescription>
				</DialogHeader>

				{!isSharing ? (
					<div className="space-y-4 mt-2">
						<div className="space-y-2">
							<Label htmlFor="port">Port</Label>
							<Input id="port" value={port} placeholder="7878" onChange={(e) => setPort(e.target.value)} />
							<p className="text-xs text-muted-foreground">Make sure to forward this port on your router</p>
						</div>

						<div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
							<p className="font-medium text-foreground mb-1">Port Forwarding Required</p>
							<p>
								You need to forward port {port || '7878'} on your router to your computer's local IP for friends to connect. Search "port
								forwarding [your router brand]" for instructions.
							</p>
						</div>

						<Button variant="glow" className="w-full" disabled={isLoading} onClick={handleStartSharing}>
							{isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
							Start Sharing
						</Button>
					</div>
				) : (
					<div className="space-y-4 mt-2">
						<div className="space-y-2">
							<Label>Share Code</Label>
							<div className="flex items-center gap-2">
								<div className="flex-1 bg-muted rounded-lg px-4 py-3 font-mono text-sm break-all">{shareCode}</div>
								<Button size="icon" variant="outline" onClick={handleCopy}>
									{copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
								</Button>
							</div>
						</div>

						<div className="p-3 bg-primary/10 border border-primary/30 rounded-lg text-sm">
							<p className="font-medium text-primary mb-1">Sharing Active</p>
							<p className="text-muted-foreground">
								Keep this app running while friends are joining or syncing. They won't be able to connect if you close the app.
							</p>
						</div>

						<Button variant="outline" className="w-full" disabled={isLoading} onClick={handleStopSharing}>
							{isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
							Stop Sharing
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
