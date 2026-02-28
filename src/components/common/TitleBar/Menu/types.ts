export interface MenuOptionsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	triggerRef: React.RefObject<HTMLButtonElement>;
}
