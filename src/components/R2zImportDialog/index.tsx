import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Loader2, Package } from 'lucide-react';
import {
	Dialog,
	DialogTitle,
	DialogHeader,
	DialogContent,
	DialogDescription,
} from '@/components/ui/dialog';

import { Profile, R2zPreview } from '~/types/profile';
import { profileService } from '~/services/profile.service';

interface ImportProgress {
	total: number;
	current: number;
	modName: string;
}

interface R2zImportDialogProps {
	open: boolean;
	gameId: string;
	onClose: () => void;
	onImported: (profile: Profile) => Promise<void>;
}

const R2zImportDialog: React.FC<R2zImportDialogProps> = ({ gameId, onClose, onImported, open: isOpen }) => {
	const [r2zPath, setR2zPath] = React.useState('');
	const [profileName, setProfileName] = React.useState('');
	const [preview, setPreview] = React.useState<null | R2zPreview>(null);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isImporting, setIsImporting] = React.useState(false);
	const [importProgress, setImportProgress] = React.useState<null | ImportProgress>(null);
	const [error, setError] = React.useState('');

	const handleBrowse = async () => {
		const selected = await open({
			title: 'Select .r2z profile file',
			filters: [{ name: 'R2 Profile', extensions: ['r2z'] }],
		});
		if (selected && typeof selected === 'string') {
			setR2zPath(selected);
			setError('');
			await loadPreview(selected);
		}
	};

	const loadPreview = async (path: string) => {
		setIsLoading(true);
		setPreview(null);
		try {
			const data = await profileService.previewR2z(path);
			setPreview(data);
			if (!profileName) {
				setProfileName(data.profileName);
			}
		} catch (err) {
			setError(`Failed to read profile: ${String(err)}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleImport = async () => {
		if (!r2zPath) return;

		setIsImporting(true);
		setImportProgress(null);
		setError('');

		const unlisten = await listen<ImportProgress>('r2z_import_progress', (event) => {
			setImportProgress(event.payload);
		});

		try {
			const profile = await profileService.importR2z(gameId, r2zPath, profileName.trim() || undefined);
			await onImported(profile);
			handleClose();
		} catch (err) {
			setError(String(err));
		} finally {
			unlisten();
			setIsImporting(false);
			setImportProgress(null);
		}
	};

	const handleClose = () => {
		setR2zPath('');
		setProfileName('');
		setPreview(null);
		setError('');
		setIsLoading(false);
		setIsImporting(false);
		setImportProgress(null);
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-lg glass">
				<DialogHeader>
					<DialogTitle>Import R2Z Profile</DialogTitle>
					<DialogDescription>Import a Thunderstore r2modman profile (.r2z file)</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 pt-4">
					<div className="space-y-2">
						<Label>Profile file (.r2z)</Label>
						<div className="flex gap-2">
							<Input
								readOnly
								value={r2zPath}
								onClick={handleBrowse}
								className="flex-1 cursor-pointer"
								placeholder="Select a .r2z file..."
							/>
							<Button
								size="sm"
								variant="outline"
								className="shrink-0"
								onClick={handleBrowse}
								disabled={isLoading || isImporting}
							>
								<FileUp className="w-4 h-4" />
							</Button>
						</div>
					</div>

					{isLoading && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Reading profile...
						</div>
					)}

					{preview && (
						<>
							<div className="space-y-2">
								<Label htmlFor="r2z-name">Profile name</Label>
								<Input
									id="r2z-name"
									value={profileName}
									disabled={isImporting}
									placeholder={preview.profileName}
									onChange={(e) => setProfileName(e.target.value)}
								/>
							</div>

							<div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
								<div className="flex items-center gap-2 text-sm font-medium">
									<Package className="h-4 w-4" />
									{preview.modCount} mods in this profile
								</div>
								<div className="max-h-40 overflow-y-auto space-y-1">
									{preview.mods.map((mod) => (
										<div
											key={mod.name}
											className="flex items-center justify-between text-xs text-muted-foreground"
										>
											<span className={mod.enabled ? '' : 'line-through opacity-50'}>{mod.name}</span>
											{mod.version && <span>v{mod.version}</span>}
										</div>
									))}
								</div>
							</div>
						</>
					)}

					{error && <p className="text-sm text-destructive">{error}</p>}

					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={handleClose} disabled={isImporting}>
							Cancel
						</Button>
						<Button
							variant="glow"
							onClick={handleImport}
							disabled={isImporting || !r2zPath || isLoading || !preview}
						>
							{isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isImporting
								? importProgress
									? `Downloading ${importProgress.current}/${importProgress.total}…`
									: 'Importing...'
								: 'Import'}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default R2zImportDialog;
