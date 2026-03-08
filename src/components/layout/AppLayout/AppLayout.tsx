import { Sidebar } from '../Sidebar';
import { TopBar } from '../TopBar/TopBar';

import { AppLayoutProps } from './types';

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
