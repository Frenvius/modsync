import React from 'react';

import { Check, Download, Plus } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/usecase/util/stringUtils';

import { AddToModpackDialog } from '../AddToModpackDialog';

import { ModCardProps } from './types';

export function ModCard({
	slug,
	name,
	author,
	version,
	iconUrl,
	downloads,
	categories,
	description,
	onAdd: _onAdd,
	isInstalled = false
}: ModCardProps) {
	const [addDialogOpen, setAddDialogOpen] = React.useState(false);

	const handleAddClick = () => {
		setAddDialogOpen(true);
	};

	return (
		<>
			<div className="group p-4 bg-card hover:bg-card-hover border border-border rounded-xl transition-all duration-200 hover:border-primary/30 animate-fade-in">
				<div className="flex gap-4">
					<div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
						{iconUrl ? (
							<img alt={name} src={iconUrl} className="w-full h-full object-cover" />
						) : (
							<div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10" />
						)}
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-start justify-between gap-2">
							<div>
								<h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{name}</h3>
								<p className="text-sm text-muted-foreground">by {author}</p>
							</div>
							<Button
								size="sm"
								onClick={handleAddClick}
								variant={isInstalled ? 'outline' : 'glow'}
								className={cn('flex-shrink-0 gap-1.5', isInstalled && 'text-primary border-primary/50')}
							>
								{isInstalled ? (
									<>
										<Check className="w-4 h-4" />
										Added
									</>
								) : (
									<>
										<Plus className="w-4 h-4" />
										Add
									</>
								)}
							</Button>
						</div>

						<p className="text-sm text-muted-foreground mt-2 line-clamp-2">{description}</p>

						<div className="flex items-center gap-3 mt-3 flex-wrap">
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Download className="w-3.5 h-3.5" />
								{downloads}
							</div>
							<Badge variant="secondary" className="text-xs">
								{version}
							</Badge>
							{categories.slice(0, 2).map((cat) => (
								<Badge key={cat} variant="outline" className="text-xs">
									{cat}
								</Badge>
							))}
						</div>
					</div>
				</div>
			</div>

			<AddToModpackDialog
				modSlug={slug}
				modName={name}
				modAuthor={author}
				open={addDialogOpen}
				modIconUrl={iconUrl || null}
				onOpenChange={setAddDialogOpen}
			/>
		</>
	);
}
