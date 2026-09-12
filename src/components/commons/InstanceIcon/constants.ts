import type { LucideIcon } from 'lucide-react';

import {
  Cog,
  Gem,
  Zap,
  Moon,
  Flame,
  Skull,
  Crown,
  Ghost,
  Anchor,
  Rocket,
  Swords,
  Package,
  Sparkles,
  TreePine
} from 'lucide-react';

export const INSTANCE_ICONS: Record<string, LucideIcon> = {
  cog: Cog,
  gem: Gem,
  zap: Zap,
  moon: Moon,
  flame: Flame,
  skull: Skull,
  crown: Crown,
  ghost: Ghost,
  anchor: Anchor,
  rocket: Rocket,
  swords: Swords,
  tree: TreePine,
  package: Package,
  sparkles: Sparkles
};

export const INSTANCE_COLORS = [
  '#1bd96a',
  '#f16436',
  '#4fa3ff',
  '#b56cf5',
  '#ff6b9c',
  '#e8c547',
  '#39c5bb',
  '#b08a4a',
  '#c9532f',
  '#7a9cc6'
];

export const INSTANCE_ICON_SIZES = {
  sm: 'size-8 rounded-md [&>svg]:size-4',
  md: 'size-10 rounded-lg [&>svg]:size-5',
  lg: 'size-14 rounded-xl [&>svg]:size-7',
  xl: 'size-20 rounded-2xl [&>svg]:size-9'
};
