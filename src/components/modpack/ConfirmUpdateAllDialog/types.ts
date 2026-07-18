export interface UpdateItem {
  slug: string;
  name: string;
  currentVersion: string;
  newVersion: string;
  iconUrl: string | null;
}

export interface ConfirmUpdateAllDialogProps {
  open: boolean;
  updates: UpdateItem[];
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}
