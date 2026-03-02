import { ReactNode } from "react";

import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";

interface AppLayoutProps {
	children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
	return (
		<div className="h-screen flex bg-background overflow-hidden">
			<Sidebar />
			<div className="flex-1 flex flex-col overflow-hidden">
				<TopBar />
				<main className="flex-1 overflow-auto">
					{children}
				</main>
			</div>
		</div>
	);
}
