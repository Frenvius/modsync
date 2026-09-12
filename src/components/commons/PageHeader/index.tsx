import React from 'react';

import { cn } from '~/lib/utils';

interface PageHeaderProps {
  title: string;
  className?: string;
  description?: string;
  children?: React.ReactNode;
}

const PageHeader = ({ title, description, children, className }: PageHeaderProps) => (
  <div className={cn('flex flex-wrap items-end justify-between gap-2 border-b border-border/50 pb-3', className)}>
    <div className="flex flex-col gap-0.5">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </div>
);

export default PageHeader;
