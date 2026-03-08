export interface DeleteModpackDialogProps {
  open: boolean;
  modpackName: string;
  onConfirm?: () => void;
  onOpenChange: (open: boolean) => void;
}
