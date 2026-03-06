export interface SyncStatusPanelProps {
	message?: string;
	details?: string;
	progress?: number;
	status: 'idle' | 'error' | 'syncing' | 'complete';
}
