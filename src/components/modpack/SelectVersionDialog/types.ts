export interface ModVersion {
  id: string;
  name: string;
  loaders: string[];
  project_id: string;
  version_number: string;
  date_published: string;
  game_versions: string[];
}

interface ModrinthMod {
  slug: string;
  title: string;
  author: string;
  description: string;
  icon_url: null | string;
  source?: string;
  thunderstore_community?: string;
  thunderstore_full_name?: string;
}

export interface SelectVersionDialogProps {
  open: boolean;
  loader: null | string;
  mod: null | ModrinthMod;
  gameVersion: string;
  onOpenChange: (open: boolean) => void;
  onVersionSelect: (version: ModVersion) => void;
}
