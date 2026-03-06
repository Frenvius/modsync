import { Toaster } from '~/components/ui/toaster';
import { TooltipProvider } from '~/components/ui/tooltip';
import { Toaster as Sonner } from '~/components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import NotFound from './pages/NotFound/NotFound';
import ModpacksPage from './pages/ModpacksPage/ModpacksPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import BrowseModsPage from './pages/BrowseModsPage/BrowseModsPage';
import ModpackDetailPage from './pages/ModpackDetailPage/ModpackDetailPage';

const queryClient = new QueryClient();

const App = () => (
	<QueryClientProvider client={queryClient}>
		<TooltipProvider>
			<Toaster />
			<Sonner />
			<BrowserRouter>
				<Routes>
					<Route path="/" element={<Navigate replace to="/modpacks" />} />
					<Route path="/modpacks" element={<ModpacksPage />} />
					<Route path="/modpack/:id" element={<ModpackDetailPage />} />
					<Route path="/browse" element={<BrowseModsPage />} />
					<Route path="/settings" element={<SettingsPage />} />
					<Route path="*" element={<NotFound />} />
				</Routes>
			</BrowserRouter>
		</TooltipProvider>
	</QueryClientProvider>
);

export default App;
