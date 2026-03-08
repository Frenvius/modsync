export interface ModrinthMod {
  slug: string;
  title: string;
  author: string;
  follows: number;
  downloads: number;
  versions: string[];
  description: string;
  categories: string[];
  icon_url: null | string;
  source?: string;
  thunderstore_community?: string;
  thunderstore_full_name?: string;
}

export interface SearchResult {
  limit: number;
  offset: number;
  total_hits: number;
  mods: ModrinthMod[];
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

export interface ModVersion {
  id: string;
  name: string;
  loaders: string[];
  project_id: string;
  version_number: string;
  date_published: string;
  game_versions: string[];
}

export interface AddModsDialogProps {
  open: boolean;
  gameId: string;
  loader: null | string;
  modpackId: string;
  modpackName: string;
  existingMods: string[];
  gameVersion: string;
  onModsAdded?: () => void;
  onOpenChange: (open: boolean) => void;
}
