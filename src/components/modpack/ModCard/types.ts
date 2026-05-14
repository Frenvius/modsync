export interface ModCardProps {
  slug: string;
  name: string;
  author: string;
  dateModified: string;
  iconUrl?: string;
  downloads: string;
  onAdd?: () => void;
  onSelect?: () => void;
  isSelected?: boolean;
  description: string;
  categories: string[];
  isInstalled?: boolean;
  isDeprecated?: boolean;
}
