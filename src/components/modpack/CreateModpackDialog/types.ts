export interface GameVersion {
  version: string;
  version_type: string;
}

export interface LoaderVersionInfo {
  version: string;
  stable: boolean;
}

export interface Modpack {
  id: string;
  name: string;
}

export interface CreateModpackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (modpackId: string) => void;
}
