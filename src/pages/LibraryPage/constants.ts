import type { LibrarySortKey } from './types';

export const ALL_GAMES = '__all';
export const LIBRARY_SORT_LABELS: Record<LibrarySortKey, string> = {
  name: 'Name',
  game: 'Game',
  updated: 'Updated',
  lastPlayed: 'Last played'
};
