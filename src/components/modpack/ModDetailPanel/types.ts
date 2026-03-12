export interface DependencyInfo {
  slug: string;
  title: string;
  author: string;
  icon_url: string | null;
  project_id: string;
  dependency_type: string;
}

export interface ModDetails {
  slug: string;
  title: string;
  author: string;
  icon_url: string | null;
  description: string;
  body: string | null;
  readme: string | null;
  changelog: string | null;
  website_url: string | null;
  source_url: string | null;
  issues_url: string | null;
  downloads: number;
  follows: number;
  categories: string[];
  date_created: string;
  date_updated: string;
  latest_version: string | null;
  file_size: number | null;
  dependencies: DependencyInfo[];
  source: 'modrinth' | 'thunderstore';
}

export interface ModDetailPanelProps {
  mod: ModDetails | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  mode: 'browse' | 'modpack-view';
  modSlug?: string;
  modVersion?: string;
  gameId?: string;
  gameVersion?: string;
  loader?: string;
  thunderstoreCommunity?: string | null;
}
