import React from 'react';
import { Outlet } from 'react-router-dom';

import { Toaster } from '~/components/ui/sonner';
import { useAppStore } from '~/usecase/store/appStore';
import CreateInstanceDialog from '~/components/CreateInstance';

import Sidebar from './Sidebar';
import Titlebar from './Titlebar';

const Layout = () => {
  const ready = useAppStore((s) => s.ready);
  const hydrate = useAppStore((s) => s.hydrate);

  React.useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <Titlebar />
      <div className="flex min-h-0 flex-1 gap-1.5 overflow-hidden p-1.5">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto rounded-lg bg-panel">
          {ready ? <Outlet /> : null}
        </main>
      </div>
      <CreateInstanceDialog />
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Layout;
