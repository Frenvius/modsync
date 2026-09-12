import type { LucideIcon } from 'lucide-react';

import { NavLink } from 'react-router-dom';
import { Plus, Compass, Library, Download, Settings } from 'lucide-react';

import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { useAppStore } from '~/usecase/store/appStore';
import { DownloadStatus } from '~/domain/enums/provider.enum';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: Array<NavItem> = [
  { to: '/', label: 'Library', icon: Library },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings }
];

const Sidebar = () => {
  const openCreate = useAppStore((s) => s.setCreateInstanceOpen);
  const activeDownloads = useAppStore((s) => s.downloads.filter((d) => d.status === DownloadStatus.Active).length);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-3 pt-3 pb-2">
        <Button className="w-full justify-start" onClick={() => openCreate(true)}>
          <Plus data-icon="inline-start" />
          Create instance
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors',
                'hover:bg-sidebar-accent hover:text-foreground',
                isActive && 'bg-sidebar-accent text-primary'
              )
            }
          >
            <item.icon className="size-5 shrink-0 opacity-80 transition-colors group-hover:opacity-100" />
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
