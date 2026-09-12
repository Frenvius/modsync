import type { Modpack, ModpackMod } from '~/domain/interfaces/modpack.interface';

export interface EditMetadataDialogProps {
  open: boolean;
  modpack: Modpack;
  onOpenChange: (open: boolean) => void;
}

export interface AddModDialogProps {
  open: boolean;
  modpack: Modpack;
  onAdd: (mod: ModpackMod) => void;
  onOpenChange: (open: boolean) => void;
}
