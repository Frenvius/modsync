import type { NavItem } from './types';

import { Compass, Library, Download, Settings } from 'lucide-react';

export const NAV_ITEMS: Array<NavItem> = [
  { to: '/', icon: Library, label: 'Library' },
  { icon: Compass, to: '/discover', label: 'Discover' },
  { icon: Download, to: '/downloads', label: 'Downloads' }
];

export const SETTINGS_NAV_ITEM: NavItem = { icon: Settings, to: '/settings', label: 'Settings' };
