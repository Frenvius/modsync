import type { SearchSort } from '~/domain/interfaces/project.interface';

export const DISCOVER_SORTS: Array<{ label: string; value: SearchSort }> = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
];
