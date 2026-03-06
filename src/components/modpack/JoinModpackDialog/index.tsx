import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { cn } from '~/usecase/util/stringUtils';
import { toast } from '~/usecase/hooks/use-toast';
import { AlertCircle, Link as LinkIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { JoinModpackDialogProps, Modpack } from './types';

export function JoinModpackDialog({ open, onJoined, onOpenChange }: JoinModpackDialogProps) {
	const [code, setCode] = React.useState('');
	const [status, setStatus] = React.useState<'idle' | 'error' | 'loading'>('idle');
	const [error, setError] = React.useState<null | string>(null);

	const handleJoin = async () => {
		if (!code.trim()) return;

		setStatus('loading');
		setError(null);

		try {
			const modpack = await invoke<Modpack>('join_modpack', {
				shareCode: code.trim()
			});

			toast({
				title: 'Modpack joined!',
				description: `You've joined "${modpack.name}" with ${modpack.mods.length} mods.`
			});

			setStatus('idle');
			setCode('');
			onOpenChange(false);

			onJoined?.(modpack.id);
		} catch (err) {
			console.error('Failed to join modpack:', err);
			setError(String(err));
			setStatus('error');
		}
	};

	const handleClose = (open: boolean) => {
		if (!open) {
			setStatus('idle');
			setCode('');
			setError(null);
		}
		onOpenChange(open);
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<LinkIcon className="w-5 h-5 text-primary" />
						Join Modpack
					</DialogTitle>
					<DialogDescription>Enter the share code from a friend to join their modpack.</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					<div className="relative">
						<Input
							value={code}
							disabled={status === 'loading'}
							placeholder="Paste share code here"
							className={cn('text-center font-mono h-14', status === 'error' && 'border-destructive bg-destructive/5')}
							onChange={(e) => {
								setCode(e.target.value);
								if (status === 'error') {
									setStatus('idle');
									setError(null);
								}
							}}
						/>
						{status === 'error' && <AlertCircle className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-destructive" />}
					</div>

					{status === 'error' && error && (
						<div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
							<p className="font-medium text-destructive">Failed to join</p>
							<p className="text-muted-foreground mt-1">{error}</p>
						</div>
					)}

					<div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
						<p>The modpack owner must be online and sharing for you to join. You can sync updates anytime they're online.</p>
					</div>

					<Button variant="glow" className="w-full" onClick={handleJoin} disabled={!code.trim() || status === 'loading'}>
						{status === 'loading' ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Connecting...
							</>
						) : (
							'Join Modpack'
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
