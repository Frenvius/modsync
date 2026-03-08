interface ModpackMod {
  slug: string;
  title: string;
  author: string;
  version: string;
  icon_url: null | string;
}

export interface Modpack {
  id: string;
  name: string;
  game_id: string;
  loader: string;
  is_owner: boolean;
  mods: ModpackMod[];
  created_at: string;
  updated_at: string;
  game_version: string;
  minecraft_version?: string;
  share_code: null | string;
  description: null | string;
}

export interface ModInfo {
  slug: string;
  title: string;
  author: string;
  version_id: string;
  version_number: string;
  icon_url: null | string;
}

export interface DependencyInfo {
  slug: string;
  title: string;
  author: string;
  project_id: string;
  icon_url: null | string;
  dependency_type: string;
}

export interface ModWithDependencies {
  mod_info: ModInfo;
  dependencies: DependencyInfo[];
}

export interface AddToModpackDialogProps {
  open: boolean;
  modSlug: string;
  modName: string;
  modAuthor: string;
  onAdded?: () => void;
  modIconUrl: null | string;
  onOpenChange: (open: boolean) => void;
}
