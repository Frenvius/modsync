import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Button } from '~/components/ui/button';
import { useGame } from '~/contexts/GameContext';
import { toast } from '~/usecase/hooks/use-toast';
import { Textarea } from '~/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { LOADERS } from './constants';
import { CreateModpackDialogProps, GameVersion, Modpack } from './types';

export function CreateModpackDialog({ open, onCreated, onOpenChange }: CreateModpackDialogProps) {
	const { selectedGame } = useGame();
	const [name, setName] = React.useState('');
	const [description, setDescription] = React.useState('');
	const [gameVersion, setGameVersion] = React.useState('');
	const [loader, setLoader] = React.useState('');
	const [versions, setVersions] = React.useState<GameVersion[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isCreating, setIsCreating] = React.useState(false);
	const [imagePreview, setImagePreview] = React.useState<null | string>(null);
	const [imageData, setImageData] = React.useState<null | string>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			toast({
				title: 'Invalid file',
				variant: 'destructive',
				description: 'Please select an image file'
			});
			return;
		}

		const previewUrl = URL.createObjectURL(file);
		setImagePreview(previewUrl);

		const reader = new FileReader();
		reader.onload = () => {
			const base64 = (reader.result as string).split(',')[1];
			setImageData(base64);
		};
		reader.readAsDataURL(file);
	};

	const removeImage = () => {
		setImagePreview(null);
		setImageData(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	React.useEffect(() => {
		if (open) {
			loadVersions();
		}
	}, [open, selectedGame]);

	const loadVersions = async () => {
		if (!selectedGame?.requires_loader) {
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		try {
			const gameVersions = await invoke<GameVersion[]>('get_game_versions', { gameId: selectedGame.id });
			setVersions(gameVersions);
		} catch (error) {
			console.error('Failed to load game versions:', error);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: 'Failed to load game versions'
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleCreate = async () => {
		if (!name.trim()) {
			toast({
				variant: 'destructive',
				title: 'Validation error',
				description: 'Please enter a modpack name'
			});
			return;
		}

		const requiresLoader = selectedGame?.requires_loader ?? true;

		if (requiresLoader && !gameVersion) {
			toast({
				variant: 'destructive',
				title: 'Validation error',
				description: 'Please select a game version'
			});
			return;
		}

		if (requiresLoader && !loader) {
			toast({
				variant: 'destructive',
				title: 'Validation error',
				description: 'Please select a mod loader'
			});
			return;
		}

		setIsCreating(true);
		try {
			const modpack = await invoke<Modpack>('create_modpack', {
				gameId: selectedGame?.id ?? 'minecraft',
				gameVersion: requiresLoader ? gameVersion : selectedGame?.default_version ?? 'latest',
				loader: requiresLoader ? loader : null,
				name: name.trim(),
				description: description.trim() || null
			});

			if (imageData) {
				try {
					await invoke('set_modpack_image', {
						imageData,
						modpackId: modpack.id
					});
				} catch (err) {
					console.error('Failed to save image:', err);
				}
			}

			setName('');
			setDescription('');
			setGameVersion('');
			setLoader('');
			setImagePreview(null);
			setImageData(null);

			onOpenChange(false);
			onCreated?.(modpack.id);
		} catch (error) {
			console.error('Failed to create modpack:', error);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to create modpack: ${error}`
			});
		} finally {
			setIsCreating(false);
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (isCreating) return;

		if (!newOpen) {
			setName('');
			setDescription('');
			setGameVersion('');
			setLoader('');
			setImagePreview(null);
			setImageData(null);
		}
		onOpenChange(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Create New Modpack</DialogTitle>
					<DialogDescription>Set up a new modpack to start adding mods.</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 mt-4">
					<div className="flex gap-4">
						<div className="flex-1 space-y-2">
							<Label htmlFor="name">Name *</Label>
							<Input
								id="name"
								value={name}
								disabled={isCreating}
								placeholder="My Awesome Modpack"
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label>Image</Label>
							<div
								onClick={() => fileInputRef.current?.click()}
								className="w-16 h-16 rounded-md border-2 border-dashed border-border hover:border-primary/50 transition-colors flex items-center justify-center overflow-hidden cursor-pointer bg-muted/50 relative group"
							>
								{imagePreview ? (
									<>
										<img alt="Preview" src={imagePreview} className="w-full h-full object-cover" />
										<button
											type="button"
											disabled={isCreating}
											onClick={(e) => {
												e.stopPropagation();
												removeImage();
											}}
											className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
										>
											<X className="w-4 h-4 text-white" />
										</button>
									</>
								) : (
									<ImagePlus className="w-5 h-5 text-muted-foreground" />
								)}
							</div>
							<input
								type="file"
								accept="image/*"
								ref={fileInputRef}
								className="hidden"
								disabled={isCreating}
								onChange={handleImageSelect}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							rows={3}
							id="description"
							value={description}
							disabled={isCreating}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="A brief description of your modpack..."
						/>
					</div>

					{selectedGame?.requires_loader && (
						<>
							<div className="space-y-2">
								<Label htmlFor="version">Game Version *</Label>
								<Select disabled={isCreating} value={gameVersion} onValueChange={setGameVersion}>
									<SelectTrigger>
										<SelectValue placeholder={isLoading ? 'Loading...' : 'Select version'} />
									</SelectTrigger>
									<SelectContent>
										{versions.map((v) => (
											<SelectItem key={v.version} value={v.version}>
												{v.version}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="loader">Mod Loader *</Label>
								<Select value={loader} disabled={isCreating} onValueChange={setLoader}>
									<SelectTrigger>
										<SelectValue placeholder="Select loader" />
									</SelectTrigger>
									<SelectContent>
										{LOADERS.map((l) => (
											<SelectItem key={l.value} value={l.value}>
												{l.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</>
					)}
				</div>

				<DialogFooter className="mt-4">
					<Button variant="outline" disabled={isCreating} onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					<Button variant="glow" disabled={isCreating} onClick={handleCreate}>
						{isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						Create Modpack
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
