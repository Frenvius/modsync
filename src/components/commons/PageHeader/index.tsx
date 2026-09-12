import React from 'react';

import { cn } from '~/lib/utils';

interface PageHeaderProps {
  title: string;
  className?: string;
  description?: string;
  children?: React.ReactNode;
}

const PageHeader = ({ title, description, children, className }: PageHeaderProps) => (
  <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
    <div className="flex flex-col gap-1">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </div>
);

export default PageHeader;
