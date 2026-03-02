import { cn } from '@/lib/utils';
import { Store, Package, Settings, FileText } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import GameSelector from '~/components/GameSelector';

const navItems = [
	{ path: '/', icon: Package, label: 'Manage Profile' },
	{ icon: Store, path: '/browse', label: 'Browse Mods' },
	{ icon: FileText, path: '/config', label: 'Config Editor' },
];

export function Sidebar() {
	const location = useLocation();
	const navigate = useNavigate();

	return (
		<aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
			<div data-tauri-drag-region className="h-[50px] flex items-center px-4 border-b border-sidebar-border select-none">
				<div data-tauri-drag-region className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
						<Package className="w-5 h-5 text-primary-foreground" />
					</div>
					<span className="font-bold text-lg text-foreground">ModSync</span>
				</div>
			</div>

			<GameSelector />

			<nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
				{navItems.map((item) => {
					const isActive = location.pathname === item.path;
					return (
						<NavLink
							to={item.path}
							key={item.path}
							className={cn(
								'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
								isActive ? 'bg-sidebar-accent text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
							)}
						>
							<item.icon className={cn('w-5 h-5 transition-colors', isActive && 'text-primary')} />
							<span className="font-medium whitespace-nowrap">{item.label}</span>
							{isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
						</NavLink>
					);
				})}
			</nav>
			<div className="border-t border-sidebar-border shrink-0">
				<button
					onClick={() => navigate('/settings')}
					className={cn(
						'flex items-center gap-3 px-6 w-full h-[50px] transition-all duration-200',
						location.pathname === '/settings'
							? 'bg-sidebar-accent text-primary'
							: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
					)}
				>
					<Settings className="w-5 h-5 shrink-0" />
					<span className="font-medium whitespace-nowrap leading-none">Settings</span>
				</button>
			</div>
		</aside>
	);
}
