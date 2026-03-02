import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink as ExternalLinkComp } from '@/components/ui/external-link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectItem, SelectValue, SelectContent, SelectTrigger } from '@/components/ui/select';
import { Lock, Search, Loader2, Download, RefreshCw, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

import { useToast } from '~/components/Toast';
import ModDetailPanel from '~/components/ModDetailPanel';
import { AppStateContext } from '~/context/AppState/constants';
import { SortBy, PackageInfo, SearchResult, thunderstoreService } from '~/services/thunderstore.service';

const ITEMS_PER_PAGE = 20;

interface BrowserState {
	sortBy: SortBy;
	category: string;
	searchQuery: string;
	currentPage: number;
	categories: string[];
	results: null | SearchResult;
}

let _browserState: null | BrowserState = null;

const ModBrowser: React.FC = () => {
	const toast = useToast();
	const { isReadOnly } = React.useContext(AppStateContext);

	const [searchQuery, setSearchQuery] = React.useState(_browserState?.searchQuery ?? '');
	const [category, setCategory] = React.useState<string>(_browserState?.category ?? 'all');
	const [sortBy, setSortBy] = React.useState<SortBy>(_browserState?.sortBy ?? 'downloads');
	const [currentPage, setCurrentPage] = React.useState(_browserState?.currentPage ?? 0);
	const [results, setResults] = React.useState<null | SearchResult>(_browserState?.results ?? null);
	const [categories, setCategories] = React.useState<string[]>(_browserState?.categories ?? []);
	const [isLoading, setIsLoading] = React.useState(false);
	const [isRefreshing, setIsRefreshing] = React.useState(false);
	const [installingPackage, setInstallingPackage] = React.useState<null | string>(null);
	const [selectedPackage, setSelectedPackage] = React.useState<null | PackageInfo>(null);

	const game = 'valheim'; // TODO: Make this dynamic with multi-game support

	const stateRef = React.useRef<BrowserState>({ sortBy, results, category, categories, searchQuery, currentPage });
	stateRef.current = { sortBy, results, category, categories, searchQuery, currentPage };

	React.useEffect(() => {
		return () => {
			_browserState = stateRef.current;
		};
	}, []);

	const debounceRef = React.useRef<null | ReturnType<typeof setTimeout>>(null);

	const loadCategories = React.useCallback(async () => {
		if (categories.length > 0) return;
		try {
			const cats = await thunderstoreService.getCategories(game);
			setCategories(cats);
		} catch (err) {
			console.error('Failed to load categories:', err);
		}
	}, [categories.length, game]);

	const searchPackages = React.useCallback(
		async (reset = false, explicitPage?: number) => {
			setIsLoading(true);
			try {
				const page = reset ? 0 : explicitPage !== undefined ? explicitPage : currentPage;
				if (reset) setCurrentPage(0);

				const result = await thunderstoreService.search(game, {
					page,
					sortBy,
					pageSize: ITEMS_PER_PAGE,
					query: searchQuery || undefined,
					category: category !== 'all' ? category : undefined
				});
				setResults(result);
			} catch (err) {
				toast.error('Search failed', String(err));
			} finally {
				setIsLoading(false);
			}
		},
		[game, searchQuery, category, sortBy, currentPage, toast]
	);

	React.useEffect(() => {
		loadCategories();
		if (!_browserState?.results) {
			searchPackages(true);
		}
	}, []);

	const isFirstCatSortRun = React.useRef(true);
	React.useEffect(() => {
		if (isFirstCatSortRun.current) {
			isFirstCatSortRun.current = false;
			return;
		}
		searchPackages(true);
	}, [category, sortBy]);

	const isFirstQueryRun = React.useRef(true);
	React.useEffect(() => {
		if (isFirstQueryRun.current) {
			isFirstQueryRun.current = false;
			return;
		}
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => searchPackages(true), 400);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [searchQuery]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		if (debounceRef.current) clearTimeout(debounceRef.current);
		searchPackages(true);
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await thunderstoreService.refreshCache();
			_browserState = null;
			await searchPackages(true);
			toast.success('Cache refreshed');
		} catch (err) {
			toast.error('Refresh failed', String(err));
		} finally {
			setIsRefreshing(false);
		}
	};

	const handlePageChange = (newPage: number) => {
		setCurrentPage(newPage);
		searchPackages(false, newPage);
	};

	const handleInstall = async (pkg: PackageInfo) => {
		setInstallingPackage(pkg.full_name);
		try {
			// TODO: Get actual target path from profile
			const targetPath = '';
			await thunderstoreService.installPackage(game, pkg.full_name, pkg.version, targetPath);
			toast.success('Package installed', `${pkg.name} v${pkg.version}`);
		} catch (err) {
			toast.error('Install failed', String(err));
		} finally {
			setInstallingPackage(null);
		}
	};

	const handleCardClick = (pkg: PackageInfo) => {
		setSelectedPackage((prev) => (prev?.full_name === pkg.full_name ? null : pkg));
	};

	const formatNumber = (num: number): string => {
		if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
		if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
		return num.toString();
	};

	return (
		<div className="flex h-full gap-0 overflow-hidden">
			<div className="flex flex-col flex-1 min-w-0 overflow-hidden pt-4">
				<div className="flex items-center justify-between px-6 mb-4">
					<div>
						<h1 className="text-2xl font-bold text-foreground">Browse Mods</h1>
						<p className="text-sm text-muted-foreground">
							{results ? `${results.total_count.toLocaleString()} packages available` : 'Loading...'}
						</p>
					</div>
					<Button size="sm" variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
						{isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
					</Button>
				</div>
				<form onSubmit={handleSearch} className="flex gap-2 items-center px-6 mb-4">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							className="pl-10"
							value={searchQuery}
							placeholder="Search packages..."
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
					<Select value={category} onValueChange={setCategory}>
						<SelectTrigger className="w-[160px] h-10 rounded-lg border border-input bg-secondary text-sm">
							<SelectValue placeholder="Category" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Categories</SelectItem>
							{categories.map((cat) => (
								<SelectItem key={cat} value={cat}>
									{cat}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
						<SelectTrigger className="w-[160px] h-10 rounded-lg border border-input bg-secondary text-sm">
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="downloads">Most Downloaded</SelectItem>
							<SelectItem value="rating">Highest Rated</SelectItem>
							<SelectItem value="last_updated">Last Updated</SelectItem>
							<SelectItem value="name">Name</SelectItem>
						</SelectContent>
					</Select>
					<Button type="submit" disabled={isLoading}>
						{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
					</Button>
				</form>
				<div className="flex-1 overflow-y-auto px-6">
					{isLoading && !results ? (
						<div className="flex items-center justify-center h-48">
							<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						</div>
					) : results?.packages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
							<Search className="h-12 w-12 mb-2" />
							<p>No packages found</p>
						</div>
					) : (
						<div className="grid gap-3 pb-4 -mr-2">
							{results?.packages.map((pkg) => (
								<Card
									key={pkg.full_name}
									onClick={() => handleCardClick(pkg)}
									className={`glass cursor-pointer transition-colors ${
										selectedPackage?.full_name === pkg.full_name ? 'bg-muted/50 ring-1 ring-primary/50' : 'hover:bg-muted/20'
									}`}
								>
									<CardContent className="p-4">
										<div className="flex gap-4">
											<img
												loading="lazy"
												alt={pkg.name}
												src={pkg.icon || '/placeholder-mod.png'}
												className="w-16 h-16 rounded-lg object-cover bg-muted"
												onError={(e) => {
													(e.target as HTMLImageElement).src =
														'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="%23333" width="64" height="64"/><text x="32" y="36" text-anchor="middle" fill="%23666" font-size="24">?</text></svg>';
												}}
											/>
											<div className="flex-1 min-w-0">
												<div className="flex items-start justify-between gap-2">
													<div>
														<h3 className="font-semibold text-foreground truncate">{pkg.name}</h3>
														<p className="text-sm text-muted-foreground">by {pkg.owner}</p>
													</div>
													<div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
														<ExternalLinkComp
															href={`https://thunderstore.io/c/${game}/p/${pkg.owner}/${pkg.name}/`}
															className="text-muted-foreground hover:text-foreground transition-colors"
														>
															<ExternalLink className="h-4 w-4" />
														</ExternalLinkComp>
														<Tooltip>
															<TooltipTrigger asChild>
																<span>
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={() => handleInstall(pkg)}
																		disabled={installingPackage === pkg.full_name || isReadOnly}
																	>
																		{installingPackage === pkg.full_name ? (
																			<Loader2 className="h-4 w-4 animate-spin" />
																		) : isReadOnly ? (
																			<Lock className="h-4 w-4" />
																		) : (
																			<Download className="h-4 w-4" />
																		)}
																	</Button>
																</span>
															</TooltipTrigger>
															<TooltipContent>
																{isReadOnly ? 'Read-only mode - synced to another modpack' : 'Install package'}
															</TooltipContent>
														</Tooltip>
													</div>
												</div>
												<p className="text-sm text-muted-foreground line-clamp-2 mt-1">{pkg.description}</p>
												<div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
													<span>v{pkg.version}</span>
													<span>{formatNumber(pkg.downloads)} downloads</span>
													{pkg.is_deprecated && <span className="text-yellow-500">Deprecated</span>}
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</div>
				<div className="h-[50px] shrink-0 flex items-center justify-between border-t border-border px-6">
					{results && results.total_pages > 1 && (
						<>
							<p className="text-sm text-muted-foreground">
								Page {currentPage + 1} of {results.total_pages}
							</p>
							<div className="flex gap-2">
								<Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => handlePageChange(currentPage - 1)}>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => handlePageChange(currentPage + 1)}
									disabled={currentPage >= results.total_pages - 1}
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</>
					)}
				</div>
			</div>
			{selectedPackage && (
				<ModDetailPanel
					game={game}
					mode="browse"
					pkg={selectedPackage}
					isReadOnly={isReadOnly}
					onInstall={handleInstall}
					onClose={() => setSelectedPackage(null)}
					isInstalling={installingPackage === selectedPackage.full_name}
				/>
			)}
		</div>
	);
};

export default ModBrowser;
