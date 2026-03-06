import { Button } from '~/components/ui/button';
import { cn } from '~/usecase/util/stringUtils';
import { Progress } from '~/components/ui/progress';
import { AlertCircle, CheckCircle2, Clock, Download, RefreshCw, Upload } from 'lucide-react';

import { SyncStatusPanelProps } from './types';

export function SyncStatusPanel({ status, details, progress = 0, message = 'All synced' }: SyncStatusPanelProps) {
	return (
		<div
			className={cn(
				'p-4 rounded-xl border transition-all duration-300',
				status === 'idle' && 'bg-card border-border',
				status === 'syncing' && 'bg-primary/5 border-primary/30',
				status === 'complete' && 'bg-success/5 border-success/30',
				status === 'error' && 'bg-destructive/5 border-destructive/30'
			)}
		>
			<div className="flex items-center gap-3">
				{status === 'idle' && <CheckCircle2 className="w-5 h-5 text-primary" />}
				{status === 'syncing' && <RefreshCw className="w-5 h-5 text-primary animate-sync" />}
				{status === 'complete' && <CheckCircle2 className="w-5 h-5 text-success" />}
				{status === 'error' && <AlertCircle className="w-5 h-5 text-destructive" />}

				<div className="flex-1">
					<p
						className={cn(
							'font-medium',
							status === 'idle' && 'text-foreground',
							status === 'syncing' && 'text-primary',
							status === 'complete' && 'text-success',
							status === 'error' && 'text-destructive'
						)}
					>
						{message}
					</p>
					{details && <p className="text-sm text-muted-foreground">{details}</p>}
				</div>

				{status === 'error' && (
					<Button size="sm" variant="outline">
						Retry
					</Button>
				)}
			</div>

			{status === 'syncing' && (
				<div className="mt-3 space-y-2">
					<Progress className="h-2" value={progress} />
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<div className="flex items-center gap-1.5">
							<Download className="w-3.5 h-3.5" />
							<span>Downloading: 12/24 mods</span>
						</div>
						<span>{progress}%</span>
					</div>
				</div>
			)}
		</div>
	);
}

export function SyncActivityList() {
	const activities = [
		{ icon: Download, type: 'download', time: '2 min ago', text: 'Downloaded Create Mod v0.5.1' },
		{ icon: Upload, type: 'upload', time: '5 min ago', text: 'Config synced to cloud' },
		{ type: 'success', icon: CheckCircle2, time: '10 min ago', text: 'JEI updated to 15.2.0' },
		{ icon: Clock, type: 'info', time: '1 hour ago', text: 'Scheduled backup completed' }
	];

	return (
		<div className="space-y-3">
			<h3 className="font-semibold text-foreground">Recent Activity</h3>
			<div className="space-y-2">
				{activities.map((activity, i) => (
					<div
						key={i}
						className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:bg-card-hover transition-colors"
					>
						<activity.icon
							className={cn(
								'w-4 h-4',
								activity.type === 'download' && 'text-primary',
								activity.type === 'upload' && 'text-warning',
								activity.type === 'success' && 'text-success',
								activity.type === 'info' && 'text-muted-foreground'
							)}
						/>
						<span className="flex-1 text-sm text-foreground">{activity.text}</span>
						<span className="text-xs text-muted-foreground">{activity.time}</span>
					</div>
				))}
			</div>
		</div>
	);
}
