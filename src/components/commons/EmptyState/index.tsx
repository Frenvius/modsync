import type { LucideIcon } from 'lucide-react';

import React from 'react';

import { cn } from '~/lib/utils';
import { Empty, EmptyMedia, EmptyTitle, EmptyHeader, EmptyContent, EmptyDescription } from '~/components/ui/empty';

interface EmptyStateProps {
  title: string;
  icon: LucideIcon;
  className?: string;
  description?: string;
  children?: React.ReactNode;
}

const EmptyState = ({ icon: Icon, title, description, children, className }: EmptyStateProps) => (
  <Empty className={cn('rounded-lg border border-dashed border-border/70 bg-card/40 py-16', className)}>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Icon />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      {description && <EmptyDescription>{description}</EmptyDescription>}
    </EmptyHeader>
    {children && <EmptyContent>{children}</EmptyContent>}
  </Empty>
);

export default EmptyState;
