import React from 'react';

import { invoke } from '@tauri-apps/api/core';
import { Calendar, ChevronRight, Loader2, Package } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { toast } from '~/usecase/hooks/use-toast';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { ModVersion, SelectVersionDialogProps } from './types';

export function SelectVersionDialog({ mod, open, loader, onOpenChange, onVersionSelect, gameVersion }: SelectVersionDialogProps) {
	const [versions, setVersions] = React.useState<ModVersion[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);

	React.useEffect(() => {
		const loadVersions = async () => {
			if (!mod || !open) return;

			setIsLoading(true);
			setVersions([]);

			try {
				const result = await invoke<ModVersion[]>('get_mod_versions', {
					slug: mod.slug,
					loader: loader,
					gameVersion: gameVersion,
					source: mod.source,
					thunderstoreCommunity: mod.thunderstore_community
				});
				setVersions(result);
			} catch (error) {
				console.error('Failed to load versions:', error);
				toast({
					title: 'Error',
					variant: 'destructive',
					description: 'Failed to load mod versions'
				});
			} finally {
				setIsLoading(false);
			}
		};

		loadVersions();
	}, [mod, open, gameVersion, loader]);

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	};

	const handleSelect = (version: ModVersion) => {
		onVersionSelect(version);
		onOpenChange(false);
	};

	if (!mod) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
							{mod.icon_url ? (
								<img alt={mod.title} src={mod.icon_url} className="w-full h-full object-cover" />
							) : (
								<Package className="w-4 h-4 text-muted-foreground" />
							)}
						</div>
						<span className="truncate">{mod.title}</span>
					</DialogTitle>
					<DialogDescription>
						Select a version compatible with {gameVersion} ({loader})
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="flex-1 -mx-6 px-6">
					<div className="space-y-2 max-h-[400px]">
						{isLoading ? (
							<div className="flex items-center justify-center py-12">
								<Loader2 className="w-6 h-6 animate-spin text-primary" />
							</div>
						) : versions.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
								<Package className="w-10 h-10 mb-2 opacity-50" />
								<p className="text-sm">No compatible versions found</p>
							</div>
						) : (
							versions.map((version, index) => (
								<button
									key={version.id}
									onClick={() => handleSelect(version)}
									className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:bg-card-hover hover:border-primary/30 transition-colors text-left group"
								>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm text-foreground">{version.version_number}</span>
											{index === 0 && (
												<Badge variant="default" className="text-[10px] px-1.5 py-0">
													Latest
												</Badge>
											)}
										</div>
										<div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
											<span className="flex items-center gap-1">
												<Calendar className="w-3 h-3" />
												{formatDate(version.date_published)}
											</span>
											{version.name && version.name !== version.version_number && <span className="truncate">{version.name}</span>}
										</div>
									</div>
									<ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
								</button>
							))
						)}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
