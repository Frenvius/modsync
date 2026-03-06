export interface InstallProgress {
	stage: string;
	total: number;
	current: number;
	message: string;
}

export interface InstallDialogProps {
	open: boolean;
	modpackId: string;
	modpackName: string;
	onInstallComplete?: () => void;
	onOpenChange: (open: boolean) => void;
}
