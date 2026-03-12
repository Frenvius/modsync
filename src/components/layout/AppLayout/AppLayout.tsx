import { Sidebar } from '../Sidebar';
import { TopBar } from '../TopBar/TopBar';

import { cn } from '~/usecase/util/stringUtils';

import { AppLayoutProps } from './types';

export function AppLayout({ children, fullBleed }: AppLayoutProps) {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className={cn('flex-1 flex flex-col', fullBleed ? 'overflow-hidden' : 'overflow-auto p-6')}>{children}</main>
      </div>
    </div>
  );
}
