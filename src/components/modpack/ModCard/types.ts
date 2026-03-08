export interface ModCardProps {
  slug: string;
  name: string;
  author: string;
  version: string;
  iconUrl?: string;
  downloads: string;
  onAdd?: () => void;
  description: string;
  categories: string[];
  isInstalled?: boolean;
}
