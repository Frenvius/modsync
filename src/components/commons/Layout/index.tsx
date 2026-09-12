import React from 'react';
import { Outlet } from 'react-router-dom';

import Sidebar from './Sidebar';
import Titlebar from './Titlebar';
import { Toaster } from '~/components/ui/sonner';
import { useAppStore } from '~/usecase/store/appStore';
import CreateInstanceDialog from '~/components/CreateInstance';

const Layout = () => {
  const ready = useAppStore((s) => s.ready);
  const hydrate = useAppStore((s) => s.hydrate);

  React.useEffect(() => {
    void hydrate();
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-background">{ready ? <Outlet /> : null}</main>
      </div>
      <CreateInstanceDialog />
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Layout;
