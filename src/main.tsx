import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { TooltipProvider } from '@/components/ui/tooltip';
import { check, Update } from '@tauri-apps/plugin-updater';
import { Route, Routes, BrowserRouter } from 'react-router-dom';

import './styles/globals.css';
import './styles/global.scss';
import AppProviders from '~/context';
import Home from '~/components/Home';
import Settings from '~/components/Settings';
import { Config } from '~/context/AppState/types';
import TitleBar from '~/components/common/TitleBar';

const ModUpdater = () => {
	const [update, setUpdate] = React.useState<null | Update>(null);
	const [config, setConfig] = React.useState<null | Config>(null);

	if (typeof window !== 'undefined') {
		document.onkeydown = function (e) {
			if (e.which === 116) {
				e.preventDefault();
			}
		};

		document.addEventListener('contextmenu', (e) => {
			e.preventDefault();
		});
	}

	React.useEffect(() => {
		invoke('get_initial_data').then((data) => {
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
		return <div className="dark bg-[#262626] p-5 text-white">Loading...</div>;
	}

	return (
		<BrowserRouter>
			<TooltipProvider>
				<AppProviders data={config} update={update}>
					<TitleBar />
					<Routes>
						<Route path="/" Component={Home} />
						<Route path="/settings" Component={Settings} />
					</Routes>
				</AppProviders>
			</TooltipProvider>
		</BrowserRouter>
	);
};

document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<ModUpdater />);
