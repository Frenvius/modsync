import { cn } from '~/usecase/util/stringUtils';
import { Package, Settings } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import { navItems } from './constants';

export function Sidebar() {
	const location = useLocation();

	return (
		<aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
			<div data-tauri-drag-region className="h-12 flex items-center px-4 border-b border-sidebar-border select-none">
				<div data-tauri-drag-region className="flex items-center gap-2">
					<div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
						<Package className="w-5 h-5 text-primary-foreground" />
					</div>
					<span className="font-bold text-lg text-foreground">ModSync</span>
				</div>
			</div>
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
							<span className="font-medium">{item.label}</span>
							{isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
						</NavLink>
					);
				})}
			</nav>
			<div className="p-1 border-t border-sidebar-border">
				<NavLink
					to="/settings"
					className={cn(
						'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
						location.pathname === '/settings'
							? 'bg-sidebar-accent text-primary'
							: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
					)}
				>
					<Settings className="w-5 h-5" />
					<span className="font-medium">Settings</span>
				</NavLink>
			</div>
		</aside>
	);
}
