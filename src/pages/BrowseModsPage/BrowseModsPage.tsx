import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ModCard } from '~/components/modpack/ModCard';
import { formatDownloads } from '~/usecase/util/stringUtils';
import { AppLayout } from '~/components/layout/AppLayout/AppLayout';
import { Clock, Filter, Loader2, Search, Sparkles, Star, TrendingUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

import { Category, GameVersion, ModLoader, ModrinthMod, SearchResult } from './types';

export default function BrowseModsPage() {
	const [searchQuery, setSearchQuery] = React.useState('');
	const [selectedCategory, setSelectedCategory] = React.useState('All');
	const [selectedVersion, setSelectedVersion] = React.useState('');
	const [selectedLoader, setSelectedLoader] = React.useState('all');
	const [sortBy, setSortBy] = React.useState('relevance');
	const [installedMods, setInstalledMods] = React.useState<string[]>([]);

	const [mods, setMods] = React.useState<ModrinthMod[]>([]);
	const [categories, setCategories] = React.useState<Category[]>([]);
	const [gameVersions, setGameVersions] = React.useState<GameVersion[]>([]);
	const [loaders, setLoaders] = React.useState<ModLoader[]>([]);

	const [loading, setLoading] = React.useState(false);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [totalHits, setTotalHits] = React.useState(0);
	const [offset, setOffset] = React.useState(0);
	const [error, setError] = React.useState<null | string>(null);

	const [debouncedQuery, setDebouncedQuery] = React.useState('');

	React.useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(searchQuery);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	React.useEffect(() => {
		async function loadFilters() {
			try {
				const [cats, versions, ldrs] = await Promise.all([
					invoke<Category[]>('get_mod_categories'),
					invoke<GameVersion[]>('get_game_versions'),
					invoke<ModLoader[]>('get_mod_loaders')
				]);

				setCategories(cats);
				setGameVersions(versions.slice(0, 20));
				setLoaders(ldrs.filter((l) => l.supported_project_types.includes('mod')));

				if (versions.length > 0) {
					setSelectedVersion(versions[0].version);
				}
			} catch (err) {
				console.error('Failed to load filters:', err);
			}
		}
		loadFilters();
	}, []);

	React.useEffect(() => {
		async function searchMods() {
			setLoading(true);
			setError(null);
			setOffset(0);

			try {
				const result = await invoke<SearchResult>('search_mods', {
					offset: 0,
					limit: 20,
					sort: sortBy,
					query: debouncedQuery || null,
					gameVersion: selectedVersion || null,
					loader: selectedLoader !== 'all' ? selectedLoader : null,
					categories: selectedCategory !== 'All' ? [selectedCategory.toLowerCase()] : null
				});

				setMods(result.mods);
				setTotalHits(result.total_hits);
				setOffset(result.limit);
			} catch (err) {
				setError(err as string);
				console.error('Search failed:', err);
			} finally {
				setLoading(false);
			}
		}

		searchMods();
	}, [debouncedQuery, selectedVersion, selectedLoader, selectedCategory, sortBy]);

	const loadMore = async () => {
		if (loadingMore || offset >= totalHits) return;

		setLoadingMore(true);
		try {
			const result = await invoke<SearchResult>('search_mods', {
				offset,
				limit: 20,
				sort: sortBy,
				query: debouncedQuery || null,
				gameVersion: selectedVersion || null,
				loader: selectedLoader !== 'all' ? selectedLoader : null,
				categories: selectedCategory !== 'All' ? [selectedCategory.toLowerCase()] : null
			});

			setMods((prev) => [...prev, ...result.mods]);
			setOffset((prev) => prev + result.limit);
		} catch (err) {
			console.error('Load more failed:', err);
		} finally {
			setLoadingMore(false);
		}
	};

	const handleToggleMod = (modSlug: string) => {
		setInstalledMods((prev) => (prev.includes(modSlug) ? prev.filter((n) => n !== modSlug) : [...prev, modSlug]));
	};

	const displayCategories = ['All', ...categories.map((c) => c.name.charAt(0).toUpperCase() + c.name.slice(1))];

	return (
		<AppLayout>
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold text-foreground">Browse Mods</h1>
					<p className="text-muted-foreground mt-1">Discover and add mods from Modrinth to your modpacks</p>
				</div>
				<div className="flex flex-col lg:flex-row gap-4">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
						<Input
							value={searchQuery}
							placeholder="Search mods..."
							className="pl-10 bg-secondary h-11"
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					<div className="flex items-center gap-3">
						<Select value={selectedVersion} onValueChange={setSelectedVersion}>
							<SelectTrigger className="w-32">
								<SelectValue placeholder="Version" />
							</SelectTrigger>
							<SelectContent>
								{gameVersions.map((v) => (
									<SelectItem key={v.version} value={v.version}>
										{v.version}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select value={selectedLoader} onValueChange={setSelectedLoader}>
							<SelectTrigger className="w-32">
								<SelectValue placeholder="Loader" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Loaders</SelectItem>
								{loaders.map((l) => (
									<SelectItem key={l.name} value={l.name}>
										{l.name.charAt(0).toUpperCase() + l.name.slice(1)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select value={sortBy} onValueChange={setSortBy}>
							<SelectTrigger className="w-40">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="relevance">
									<div className="flex items-center gap-2">
										<Sparkles className="w-4 h-4" />
										Relevance
									</div>
								</SelectItem>
								<SelectItem value="downloads">
									<div className="flex items-center gap-2">
										<TrendingUp className="w-4 h-4" />
										Downloads
									</div>
								</SelectItem>
								<SelectItem value="updated">
									<div className="flex items-center gap-2">
										<Clock className="w-4 h-4" />
										Recently Updated
									</div>
								</SelectItem>
								<SelectItem value="follows">
									<div className="flex items-center gap-2">
										<Star className="w-4 h-4" />
										Follows
									</div>
								</SelectItem>
							</SelectContent>
						</Select>

						<Button size="icon" variant="outline">
							<Filter className="w-4 h-4" />
						</Button>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{displayCategories.slice(0, 15).map((category) => (
						<Badge
							key={category}
							onClick={() => setSelectedCategory(category)}
							variant={selectedCategory === category ? 'default' : 'outline'}
							className="cursor-pointer hover:bg-primary/20 transition-colors px-3 py-1.5"
						>
							{category}
						</Badge>
					))}
				</div>
				{!loading && <p className="text-sm text-muted-foreground">{totalHits.toLocaleString()} mods found</p>}
				{error && (
					<div className="text-center py-8">
						<p className="text-destructive">Failed to load mods: {error}</p>
						<Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
							Retry
						</Button>
					</div>
				)}
				{loading && (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="w-8 h-8 animate-spin text-primary" />
					</div>
				)}
				{!loading && !error && (
					<div className="space-y-3">
						{mods.map((mod) => (
							<ModCard
								key={mod.slug}
								slug={mod.slug}
								name={mod.title}
								author={mod.author}
								description={mod.description}
								iconUrl={mod.icon_url || undefined}
								onAdd={() => handleToggleMod(mod.slug)}
								downloads={formatDownloads(mod.downloads)}
								isInstalled={installedMods.includes(mod.slug)}
								version={selectedVersion || mod.versions[0] || ''}
								categories={mod.categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1))}
							/>
						))}
					</div>
				)}
				{!loading && !error && mods.length > 0 && offset < totalHits && (
					<div className="text-center pt-4">
						<Button size="lg" variant="outline" onClick={loadMore} disabled={loadingMore}>
							{loadingMore ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Loading...
								</>
							) : (
								'Load More Mods'
							)}
						</Button>
					</div>
				)}
				{!loading && !error && mods.length === 0 && (
					<div className="text-center py-12">
						<p className="text-muted-foreground">No mods found matching your criteria</p>
					</div>
				)}
			</div>
		</AppLayout>
	);
}
