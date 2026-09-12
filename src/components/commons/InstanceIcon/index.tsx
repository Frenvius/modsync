import type { LucideIcon } from 'lucide-react';

import React from 'react';
import { Cog, Gem, Zap, Moon, Flame, Skull, Crown, Ghost, Anchor, Rocket, Swords, Package, Sparkles, TreePine } from 'lucide-react';

import { cn } from '~/lib/utils';

interface InstanceIconProps {
  icon: string;
  color: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

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
  package: Package,
  sparkles: Sparkles,
  tree: TreePine
};

export const INSTANCE_COLORS = ['#1bd96a', '#f16436', '#4fa3ff', '#b56cf5', '#ff6b9c', '#e8c547', '#39c5bb', '#b08a4a', '#c9532f', '#7a9cc6'];

const SIZES = {
  sm: 'size-8 rounded-md [&>svg]:size-4',
  md: 'size-10 rounded-lg [&>svg]:size-5',
  lg: 'size-14 rounded-xl [&>svg]:size-7',
  xl: 'size-20 rounded-2xl [&>svg]:size-9'
};

const InstanceIcon = ({ icon, color, size = 'md', className }: InstanceIconProps) => {
  const Icon = INSTANCE_ICONS[icon] ?? Package;
  return (
    <span
      aria-hidden
      style={{ background: `linear-gradient(145deg, ${color}, color-mix(in oklch, ${color} 50%, black))` }}
      className={cn('inline-flex shrink-0 items-center justify-center text-white shadow-[inset_0_1px_0_oklch(1_0_0/20%),0_2px_8px_-2px_oklch(0_0_0/50%)]', SIZES[size], className)}
    >
      <Icon strokeWidth={2.25} />
    </span>
  );
};

export default InstanceIcon;
