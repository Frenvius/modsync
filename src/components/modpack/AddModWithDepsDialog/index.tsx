import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { toast } from '~/usecase/hooks/use-toast';
import { Checkbox } from '~/components/ui/checkbox';
import { AlertCircle, Check, Loader2, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';

import { AddModWithDepsDialogProps } from './types';

export function AddModWithDepsDialog({
	open,
	modInfo,
	modpackId,
	onSuccess,
	modpackName,
	onOpenChange,
	dependencies,
	existingMods
}: AddModWithDepsDialogProps) {
	const [selectedDeps, setSelectedDeps] = React.useState<Set<string>>(() => {
		const required = new Set<string>();
		dependencies.forEach((dep) => {
			if (dep.dependency_type === 'required' && !existingMods.includes(dep.slug)) {
				required.add(dep.slug);
			}
		});
		return required;
	});
	const [isAdding, setIsAdding] = React.useState(false);

	if (!modInfo) return null;

	const filteredDeps = dependencies.filter((dep) => !existingMods.includes(dep.slug));
	const requiredDeps = filteredDeps.filter((d) => d.dependency_type === 'required');
	const optionalDeps = filteredDeps.filter((d) => d.dependency_type === 'optional');

	const toggleDep = (slug: string) => {
		const newSelected = new Set(selectedDeps);
		if (newSelected.has(slug)) {
			newSelected.delete(slug);
		} else {
			newSelected.add(slug);
		}
		setSelectedDeps(newSelected);
	};

	const handleAdd = async () => {
		setIsAdding(true);
		try {
			await invoke('add_mod_to_modpack', {
				modpackId,
				projectId: null,
				slug: modInfo.slug,
				title: modInfo.title,
				author: modInfo.author,
				iconUrl: modInfo.icon_url,
				versionId: modInfo.version_id,
				version: modInfo.version_number
			});

			for (const dep of dependencies) {
				if (selectedDeps.has(dep.slug)) {
					await invoke('add_mod_to_modpack', {
						modpackId,
						slug: dep.slug,
						versionId: null,
						title: dep.title,
						version: 'latest',
						author: dep.author,
						iconUrl: dep.icon_url,
						projectId: dep.project_id
					});
				}
			}

			const totalAdded = 1 + selectedDeps.size;
			toast({
				title: 'Mods added',
				description: `Added ${totalAdded} mod(s) to "${modpackName}".`
			});

			onOpenChange(false);
			onSuccess?.();
		} catch (error) {
			console.error('Failed to add mods:', error);
			toast({
				title: 'Error',
				variant: 'destructive',
				description: `Failed to add mods: ${error}`
			});
		} finally {
			setIsAdding(false);
		}
	};

	const alreadyInstalledDeps = dependencies.filter((dep) => existingMods.includes(dep.slug));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Add Mod with Dependencies</DialogTitle>
					<DialogDescription>"{modInfo.title}" has dependencies. Select which ones to include.</DialogDescription>
				</DialogHeader>
				<div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
							{modInfo.icon_url ? (
								<img alt={modInfo.title} src={modInfo.icon_url} className="w-full h-full object-cover" />
							) : (
								<Package className="w-5 h-5 text-muted-foreground" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<h3 className="font-medium text-sm text-foreground truncate">{modInfo.title}</h3>
							<p className="text-xs text-muted-foreground">
								by {modInfo.author} • v{modInfo.version_number}
							</p>
						</div>
						<Badge variant="default">Main</Badge>
					</div>
				</div>
				<div className="flex-1 overflow-y-auto space-y-3 min-h-0 max-h-[300px]">
					{requiredDeps.length > 0 && (
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-sm font-medium text-foreground">
								<AlertCircle className="w-4 h-4 text-orange-500" />
								Required Dependencies
							</div>
							{requiredDeps.map((dep) => (
								<div key={dep.slug} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
									<Checkbox id={dep.slug} checked={selectedDeps.has(dep.slug)} onCheckedChange={() => toggleDep(dep.slug)} />
									<div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
										{dep.icon_url ? (
											<img alt={dep.title} src={dep.icon_url} className="w-full h-full object-cover" />
										) : (
											<Package className="w-4 h-4 text-muted-foreground" />
										)}
									</div>
									<label htmlFor={dep.slug} className="flex-1 min-w-0 cursor-pointer">
										<h4 className="font-medium text-sm text-foreground truncate">{dep.title}</h4>
										<p className="text-xs text-muted-foreground truncate">by {dep.author}</p>
									</label>
									<Badge variant="secondary" className="text-xs">
										Required
									</Badge>
								</div>
							))}
						</div>
					)}
					{optionalDeps.length > 0 && (
						<div className="space-y-2">
							<div className="text-sm font-medium text-muted-foreground">Optional Dependencies</div>
							{optionalDeps.map((dep) => (
								<div key={dep.slug} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
									<Checkbox id={dep.slug} checked={selectedDeps.has(dep.slug)} onCheckedChange={() => toggleDep(dep.slug)} />
									<div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
										{dep.icon_url ? (
											<img alt={dep.title} src={dep.icon_url} className="w-full h-full object-cover" />
										) : (
											<Package className="w-4 h-4 text-muted-foreground" />
										)}
									</div>
									<label htmlFor={dep.slug} className="flex-1 min-w-0 cursor-pointer">
										<h4 className="font-medium text-sm text-foreground truncate">{dep.title}</h4>
										<p className="text-xs text-muted-foreground truncate">by {dep.author}</p>
									</label>
									<Badge variant="outline" className="text-xs">
										Optional
									</Badge>
								</div>
							))}
						</div>
					)}
					{alreadyInstalledDeps.length > 0 && (
						<div className="space-y-2">
							<div className="text-sm font-medium text-muted-foreground">Already Installed</div>
							{alreadyInstalledDeps.map((dep) => (
								<div key={dep.slug} className="flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-lg opacity-60">
									<Check className="w-4 h-4 text-primary shrink-0" />
									<div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
										{dep.icon_url ? (
											<img alt={dep.title} src={dep.icon_url} className="w-full h-full object-cover" />
										) : (
											<Package className="w-4 h-4 text-muted-foreground" />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<h4 className="font-medium text-sm text-foreground truncate">{dep.title}</h4>
										<p className="text-xs text-muted-foreground truncate">by {dep.author}</p>
									</div>
								</div>
							))}
						</div>
					)}
					{filteredDeps.length === 0 && alreadyInstalledDeps.length === 0 && (
						<div className="text-center text-sm text-muted-foreground py-4">No additional dependencies needed.</div>
					)}
				</div>
				<div className="flex items-center justify-between pt-4 border-t border-border">
					<span className="text-sm text-muted-foreground">{1 + selectedDeps.size} mod(s) will be added</span>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button variant="glow" onClick={handleAdd} disabled={isAdding}>
							{isAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
							Add Mods
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
