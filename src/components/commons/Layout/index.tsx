import React from 'react';
import { Outlet } from 'react-router-dom';

import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Button } from '~/components/ui/button';
import { Toaster } from '~/components/ui/sonner';
import { useAppStore } from '~/usecase/store/appStore';
import EmptyState from '~/components/commons/EmptyState';
import { DownloadStatus } from '~/domain/enums/provider.enum';
import CreateInstanceDialog from '~/components/CreateInstance';
import { browserService, getExternalWebUrl } from '~/usecase/service/browser';

import Sidebar from './Sidebar';
import Titlebar from './Titlebar';

const Layout = () => {
  const ready = useAppStore((s) => s.ready);
  const hydrate = useAppStore((s) => s.hydrate);
  const loadError = useAppStore((s) => s.loadError);

  React.useEffect(() => {
    void hydrate();
  }, [hydrate]);

  React.useEffect(() => {
    const openWebLink = (event: MouseEvent) => {
      if (event.defaultPrevented || ![0, 1].includes(event.button)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      const url = getExternalWebUrl(anchor.href, window.location.origin);
      if (!url) return;
      event.preventDefault();
      void browserService.openExternal(url).catch(() => toast.error('Could not open link in your browser.'));
    };
    document.addEventListener('click', openWebLink);
    document.addEventListener('auxclick', openWebLink);
    return () => {
      document.removeEventListener('click', openWebLink);
      document.removeEventListener('auxclick', openWebLink);
    };
  }, []);

  React.useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let closing = false;
    let unlisten: () => void = () => undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        const active = useAppStore
          .getState()
          .downloads.filter((download) => [DownloadStatus.Active, DownloadStatus.Queued].includes(download.status));
        if (active.length === 0 || closing) return;
        event.preventDefault();
        if (!window.confirm('Cancel active operations and close ModSync?')) return;
        closing = true;
        await Promise.allSettled(active.map((download) => useAppStore.getState().cancelDownload(download.id)));
        await getCurrentWindow().destroy();
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });
    return () => {
      disposed = true;
      unlisten();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="fixed top-1 left-1 z-50 -translate-y-12 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <Titlebar />
      <div className="flex min-h-0 flex-1 gap-1.5 overflow-hidden p-1.5">
        <Sidebar />
        <main
          tabIndex={-1}
          id="main-content"
          className="relative flex min-w-0 flex-1 flex-col overflow-y-auto rounded-lg bg-panel"
        >
          {!ready ? (
            <div role="status" className="m-auto text-sm text-muted-foreground">
              Loading ModSync...
            </div>
          ) : null}
          {ready && !loadError ? <Outlet /> : null}
          {ready && loadError ? (
            <EmptyState icon={AlertTriangle} description={loadError} title="Could not load ModSync">
              <Button variant="outline" onClick={() => void hydrate()}>
                Try again
              </Button>
            </EmptyState>
          ) : null}
        </main>
      </div>
      <CreateInstanceDialog />
      <Toaster position="bottom-right" />
    </div>
  );
};

export default Layout;
