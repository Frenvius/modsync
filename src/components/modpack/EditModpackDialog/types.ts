export interface GameVersion {
  version: string;
  version_type: string;
}

export interface LoaderVersionInfo {
  version: string;
  stable: boolean;
}

export interface EditModpackDialogProps {
  open: boolean;
  modpackId?: string;
  modpackName: string;
  modpackLoader: string;
  modpackLoaderVersion?: null | string;
  onSave?: () => void;
  modpackVersion: string;
  modpackImagePath?: null | string;
  onOpenChange: (open: boolean) => void;
}
