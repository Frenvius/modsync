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
  source?: null | string;
  filename?: null | string;
}

export interface DependencyInfo {
  slug: string;
  title: string;
  author: string;
  project_id: string;
  icon_url: null | string;
  dependency_type: string;
  version_id: null | string;
  version_number: null | string;
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

export interface CompatLayer {
  slug: string;
  label: string;
  loaders: string[];
}

export const COMPAT_LAYERS: CompatLayer[] = [
  { slug: 'connector', label: 'Sinytra Connector', loaders: ['forge'] },
  { slug: 'forgified-fabric-api', label: 'Forgified Fabric API', loaders: ['fabric'] },
  { slug: 'quilted-fabric-api', label: 'Quilted Fabric API', loaders: ['fabric'] },
  { slug: 'qsl', label: 'Quilt Standard Libraries', loaders: ['fabric'] },
];

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
