import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { check, Update } from "@tauri-apps/plugin-updater";
import { Route, Routes, BrowserRouter } from "react-router-dom";

import "./styles/globals.css";
import AppProviders from "~/context";
import Home from "~/components/Home";
import Settings from "~/components/Settings";
import { Config } from "~/context/AppState/types";
import { AppLayout } from "~/components/layout/AppLayout";

const ModUpdater = () => {
	const [update, setUpdate] = React.useState<null | Update>(null);
	const [config, setConfig] = React.useState<null | Config>(null);

	if (typeof window !== "undefined") {
		document.onkeydown = function (e) {
			if (e.which === 116) {
				e.preventDefault();
			}
		};

		document.addEventListener("contextmenu", (e) => {
			e.preventDefault();
		});
	}

	React.useEffect(() => {
		invoke("get_initial_data").then((data) => {
			setConfig(JSON.parse(data as string));
		});

		const interval = setInterval(async () => {
			const update = await check();
			setUpdate(update);
		}, 30000);

		return () => {
			clearInterval(interval);
		};
	}, []);

	if (!config) {
		return (
			<div className="h-screen flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-3">
					<div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
					<p className="text-sm text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	return (
		<BrowserRouter>
			<TooltipProvider>
				<AppProviders data={config} update={update}>
					<AppLayout>
						<Routes>
							<Route path="/" Component={Home} />
							<Route path="/settings" Component={Settings} />
						</Routes>
					</AppLayout>
				</AppProviders>
			</TooltipProvider>
		</BrowserRouter>
	);
};

document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<ModUpdater />);
