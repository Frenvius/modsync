import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { open } from '@tauri-apps/plugin-dialog';
import { Loader2, FolderOpen } from 'lucide-react';
import {
	Dialog,
	DialogTitle,
	DialogHeader,
	DialogContent,
	DialogDescription,
} from '@/components/ui/dialog';

import { Profile } from '~/types/profile';
import { profileService } from '~/services/profile.service';

interface ProfileCreateDialogProps {
	open: boolean;
	gameId: string;
	onClose: () => void;
	onCreated: (profile: Profile) => Promise<void>;
}

const ProfileCreateDialog: React.FC<ProfileCreateDialogProps> = ({ gameId, onClose, onCreated, open: isOpen }) => {
	const [name, setName] = React.useState('');
	const [customPath, setCustomPath] = React.useState('');
	const [isCreating, setIsCreating] = React.useState(false);
	const [error, setError] = React.useState('');

	const handleBrowse = async () => {
		const selected = await open({
			directory: true,
			title: 'Select profile folder',
		});
		if (selected) {
			setCustomPath(selected as string);
		}
	};

	const handleCreate = async () => {
		if (!name.trim()) {
			setError('Profile name is required');
			return;
		}

		setIsCreating(true);
		setError('');

		try {
			const profile = await profileService.createProfile(gameId, name.trim(), customPath.trim() || undefined);
			await onCreated(profile);
			handleClose();
		} catch (err) {
			setError(String(err));
		} finally {
			setIsCreating(false);
		}
	};

	const handleClose = () => {
		setName('');
		setCustomPath('');
		setError('');
		setIsCreating(false);
		onClose();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && name.trim() && !isCreating) {
			handleCreate();
		} else if (e.key === 'Escape') {
			handleClose();
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-md glass">
				<DialogHeader>
					<DialogTitle>Create Profile</DialogTitle>
					<DialogDescription>Create a new mod profile for {gameId}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 pt-4">
					<div className="space-y-2">
						<Label htmlFor="profile-name">Profile name</Label>
						<Input
							autoFocus
							value={name}
							id="profile-name"
							disabled={isCreating}
							placeholder="My Profile"
							onKeyDown={handleKeyDown}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="custom-path">Custom folder (optional)</Label>
						<div className="flex gap-2">
							<Input
								id="custom-path"
								value={customPath}
								className="flex-1"
								disabled={isCreating}
								placeholder="Default location"
								onChange={(e) => setCustomPath(e.target.value)}
							/>
							<Button
								size="sm"
								variant="outline"
								className="shrink-0"
								disabled={isCreating}
								onClick={handleBrowse}
							>
								<FolderOpen className="w-4 h-4" />
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Leave empty to use default: %appdata%\Valheim Mod Updater\profiles\
						</p>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<div className="flex justify-end gap-2">
						<Button variant="outline" disabled={isCreating} onClick={handleClose}>
							Cancel
						</Button>
						<Button variant="glow" onClick={handleCreate} disabled={isCreating || !name.trim()}>
							{isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isCreating ? 'Creating...' : 'Create'}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default ProfileCreateDialog;
