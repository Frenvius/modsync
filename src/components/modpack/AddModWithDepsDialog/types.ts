interface ModInfo {
  slug: string;
  title: string;
  author: string;
  version_id: string;
  version_number: string;
  icon_url: null | string;
}

interface DependencyInfo {
  slug: string;
  title: string;
  author: string;
  project_id: string;
  icon_url: null | string;
  dependency_type: string;
}

export interface AddModWithDepsDialogProps {
  open: boolean;
  modpackId: string;
  modpackName: string;
  existingMods: string[];
  onSuccess?: () => void;
  modInfo: null | ModInfo;
  dependencies: DependencyInfo[];
  onOpenChange: (open: boolean) => void;
}
