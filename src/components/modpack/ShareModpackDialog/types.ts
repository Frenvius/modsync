export interface ShareModpackDialogProps {
	open: boolean;
	modpackId: string;
	modpackName: string;
	currentShareCode?: null | string;
	onShareStatusChange?: () => void;
	onOpenChange: (open: boolean) => void;
}
