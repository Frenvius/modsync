export interface GameVersion {
  version: string;
  version_type: string;
}

export interface EditModpackDialogProps {
  open: boolean;
  modpackId?: string;
  modpackName: string;
  onSave?: () => void;
  modpackVersion: string;
  modpackImagePath?: null | string;
  onOpenChange: (open: boolean) => void;
}
