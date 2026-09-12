import { NavLink } from 'react-router-dom';

import { Plus } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import { DownloadStatus } from '~/domain/enums/provider.enum';

import { NAV_ITEMS } from './constants';

const Sidebar = () => {
  const openCreate = useAppStore((s) => s.setCreateInstanceOpen);
  const activeDownloads = useAppStore((s) => s.downloads.filter((d) => d.status === DownloadStatus.Active).length);

  return (
    <aside className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border bg-secondary/80 p-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openCreate(true)}
          className="w-full justify-start text-primary hover:bg-primary/15 hover:text-primary"
        >
          <Plus data-icon="inline-start" />
          Create instance
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            to={item.to}
            key={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium text-sidebar-foreground transition-colors',
                'hover:bg-item-hover hover:text-foreground',
                isActive && 'bg-primary/15 text-primary ring-1 ring-primary/30'
              )
            }
          >
            <item.icon className="size-4 shrink-0 opacity-80 transition-colors group-hover:opacity-100" />
            <span className="flex-1">{item.label}</span>
            {item.to === '/downloads' && activeDownloads > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {activeDownloads}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
