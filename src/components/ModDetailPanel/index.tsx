import React from 'react';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink as ExternalLinkComp } from '@/components/ui/external-link';
import { X, Lock, Star, Loader2, Download, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react';

import { ModEntry } from '~/services/sync.service';
import { commandService } from '~/services/command.service';
import { AppStateContext } from '~/context/AppState/constants';
import { PackageInfo, thunderstoreService } from '~/services/thunderstore.service';

export interface ModWithInfo extends ModEntry {
	packageInfo?: null | PackageInfo;
}

type BrowseMode = {
	game: string;
	mode: 'browse';
	pkg: PackageInfo;
	isReadOnly: boolean;
	isInstalling: boolean;
	onInstall: (pkg: PackageInfo) => void;
};

type InstalledMode = {
	mod: ModWithInfo;
	mode: 'installed';
	getAuthor: (mod: ModWithInfo) => string;
	getVersion: (mod: ModWithInfo) => string;
	getDisplayName: (mod: ModWithInfo) => string;
};

type Props = (BrowseMode | InstalledMode) & {
	onClose: () => void;
};

const formatNumber = (num: number): string => {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
};

const ModDetailPanel: React.FC<Props> = (props) => {
	const { onClose } = props;
	const { activeGame } = React.useContext(AppStateContext);
	const [depsOpen, setDepsOpen] = React.useState(false);
	const [activeTab, setActiveTab] = React.useState('readme');
	const [readme, setReadme] = React.useState<null | string | undefined>(undefined);
	const [changelog, setChangelog] = React.useState<null | string | undefined>(undefined);
	const [loadingReadme, setLoadingReadme] = React.useState(false);
	const [loadingChangelog, setLoadingChangelog] = React.useState(false);
	const [panelWidth, setPanelWidth] = React.useState(650);
	const isResizing = React.useRef(false);
	const startX = React.useRef(0);
	const startWidth = React.useRef(0);
	const fetchIdRef = React.useRef(0);
	const fetchedForRef = React.useRef<{ readme: null | string; changelog: null | string }>({ readme: null, changelog: null });

	const handleResizeStart = (e: React.MouseEvent) => {
		e.preventDefault();
		isResizing.current = true;
		startX.current = e.clientX;
		startWidth.current = panelWidth;
	};

	React.useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (!isResizing.current) return;
			const delta = startX.current - e.clientX;
			setPanelWidth(Math.min(Math.max(startWidth.current + delta, 280), 720));
		};
		const onMouseUp = () => {
			isResizing.current = false;
		};
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		return () => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		};
	}, []);

	const name = props.mode === 'browse' ? props.pkg.name : props.getDisplayName(props.mod);
	const author = props.mode === 'browse' ? props.pkg.owner : props.getAuthor(props.mod);
	const version = props.mode === 'browse' ? props.pkg.version : props.getVersion(props.mod);
	const info: null | undefined | PackageInfo = props.mode === 'browse' ? props.pkg : props.mod.packageInfo;
	const namespace = props.mode === 'browse' ? props.pkg.owner : props.mod.packageInfo?.owner ?? props.mod.author ?? null;
	const pkgName = props.mode === 'browse' ? props.pkg.name : props.mod.packageInfo?.name ?? props.mod.name ?? null;
	const game = props.mode === 'browse' ? props.game : activeGame;
	const isCustom = props.mode === 'installed' && props.mod.is_custom;

	const pkgVersion = props.mode === 'browse' ? props.pkg.version : props.mod.packageInfo?.version ?? props.mod.thunderstore_version ?? null;

	const parsed = namespace && pkgName && pkgVersion ? { namespace, name: pkgName, version: pkgVersion } : null;
	const thunderstoreUrl = parsed ? `https://thunderstore.io/c/${game}/p/${parsed.namespace}/${parsed.name}/` : null;

	const resetKey =
		props.mode === 'browse'
			? props.pkg.full_name
			: `${props.mod.packageInfo?.owner ?? ''}/${props.mod.packageInfo?.name ?? ''}/${props.mod.filename}`;

	React.useEffect(() => {
		setActiveTab('readme');
		setReadme(undefined);
		setChangelog(undefined);
		fetchedForRef.current = { readme: null, changelog: null };
	}, [resetKey]);

	const handleTabChange = (tab: string) => setActiveTab(tab);

	React.useEffect(() => {
		if (activeTab !== 'readme' || !parsed) return;
		const key = `${parsed.namespace}/${parsed.name}/${parsed.version}`;
		if (fetchedForRef.current.readme === key) return;
		fetchedForRef.current.readme = key;
		const fetchId = ++fetchIdRef.current;
		setLoadingReadme(true);
		thunderstoreService
			.getPackageReadme(parsed.namespace, parsed.name, parsed.version)
			.then((content) => {
				if (fetchId === fetchIdRef.current) setReadme(content);
			})
			.catch(() => {
				if (fetchId === fetchIdRef.current) setReadme(null);
			})
			.finally(() => {
				if (fetchId === fetchIdRef.current) setLoadingReadme(false);
			});
	}, [activeTab, parsed?.namespace, parsed?.name, parsed?.version]); // eslint-disable-line react-hooks/exhaustive-deps

	React.useEffect(() => {
		if (activeTab !== 'changelog' || !parsed) return;
		const key = `${parsed.namespace}/${parsed.name}/${parsed.version}`;
		if (fetchedForRef.current.changelog === key) return;
		fetchedForRef.current.changelog = key;
		const fetchId = ++fetchIdRef.current;
		setLoadingChangelog(true);
		thunderstoreService
			.getPackageChangelog(parsed.namespace, parsed.name, parsed.version)
			.then((content) => {
				if (fetchId === fetchIdRef.current) setChangelog(content);
			})
			.catch(() => {
				if (fetchId === fetchIdRef.current) setChangelog(null);
			})
			.finally(() => {
				if (fetchId === fetchIdRef.current) setLoadingChangelog(false);
			});
	}, [activeTab, parsed?.namespace, parsed?.name, parsed?.version]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div
			style={{ width: panelWidth }}
			className="shrink-0 h-full border-l border-border bg-background flex flex-col overflow-hidden relative"
		>
			<div
				onMouseDown={handleResizeStart}
				className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
			/>
			<div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
				<span className="text-sm font-semibold text-foreground">Mod Details</span>
				<button onClick={onClose} aria-label="Close panel" className="text-muted-foreground hover:text-foreground transition-colors">
					<X className="h-4 w-4" />
				</button>
			</div>
			<div className={`px-4 py-4 border-b border-border shrink-0${props.mode === 'browse' ? ' space-y-3' : ''}`}>
				<div className="flex items-start gap-3">
					<img
						alt={name}
						loading="lazy"
						src={info?.icon || ''}
						className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0"
						onError={(e) => {
							(e.target as HTMLImageElement).src =
								'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="%23333" width="64" height="64" rx="8"/><text x="32" y="42" text-anchor="middle" fill="%23666" font-size="24">?</text></svg>';
						}}
					/>
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-foreground text-sm leading-tight break-words">{name}</h2>
						<p className="text-xs text-muted-foreground mt-0.5">{props.mode === 'browse' ? `by ${author}` : author}</p>
						<div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
							{version && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">v{version}</span>}
							{isCustom && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">Custom</span>}
						</div>
					</div>
				</div>
				{props.mode === 'browse' && (
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							className="flex-1"
							disabled={props.isInstalling || props.isReadOnly}
							onClick={() => props.mode === 'browse' && props.onInstall(props.pkg)}
						>
							{props.isInstalling ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin mr-1" /> Installing...
								</>
							) : props.isReadOnly ? (
								<>
									<Lock className="h-4 w-4 mr-1" /> Read-only
								</>
							) : (
								<>
									<Download className="h-4 w-4 mr-1" /> Install
								</>
							)}
						</Button>
						{thunderstoreUrl && (
							<ExternalLinkComp
								href={thunderstoreUrl}
								className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
							>
								<ExternalLink className="h-4 w-4" />
							</ExternalLinkComp>
						)}
					</div>
				)}
			</div>
			<div className="flex-1 overflow-hidden flex flex-col">
				<Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 overflow-hidden">
					<div className="px-4 pt-3 shrink-0">
						<TabsList className="w-full">
							<TabsTrigger value="overview" className="flex-1">
								Overview
							</TabsTrigger>
							<TabsTrigger value="readme" className="flex-1">
								README
							</TabsTrigger>
							<TabsTrigger value="changelog" className="flex-1">
								Changelog
							</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent value="overview" className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 mt-3">
						{info?.is_deprecated && (
							<div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-2">
								<AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
								<span className="text-xs text-yellow-500">This mod is deprecated</span>
							</div>
						)}
						<div>
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
							<p className="text-sm text-foreground leading-relaxed">{info?.description || 'No description available'}</p>
						</div>
						{info && (
							<div className="flex items-center gap-4">
								<div className="flex items-center gap-1.5 text-muted-foreground">
									<Download className="h-3.5 w-3.5" />
									<span className="text-xs">{formatNumber(info.downloads)} downloads</span>
								</div>
								<div className="flex items-center gap-1.5 text-muted-foreground">
									<Star className="h-3.5 w-3.5" />
									<span className="text-xs">{formatNumber(info.rating)} rating</span>
								</div>
							</div>
						)}
						{info?.categories && info.categories.length > 0 && (
							<div>
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Categories</p>
								<div className="flex flex-wrap gap-1">
									{info.categories.map((cat) => (
										<span key={cat} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
											{cat}
										</span>
									))}
								</div>
							</div>
						)}
						{info?.dependencies && info.dependencies.length > 0 && (
							<div>
								<button
									onClick={() => setDepsOpen((v) => !v)}
									className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
								>
									{depsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
									Dependencies ({info.dependencies.length})
								</button>
								{depsOpen && (
									<ul className="mt-1.5 space-y-1">
										{info.dependencies.map((dep) => (
											<li key={dep} title={dep} className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded truncate">
												{dep}
											</li>
										))}
									</ul>
								)}
							</div>
						)}
						{info?.date_updated && (
							<div className="pt-2 border-t border-border">
								<p className="text-xs text-muted-foreground">Last updated: {new Date(info.date_updated).toLocaleDateString()}</p>
							</div>
						)}
						{props.mode === 'installed' && thunderstoreUrl && (
							<div className="pt-2 border-t border-border">
								<ExternalLinkComp href={thunderstoreUrl} className="text-xs text-primary hover:underline">
									View on Thunderstore →
								</ExternalLinkComp>
							</div>
						)}
					</TabsContent>
					<TabsContent value="readme" className="flex-1 overflow-y-auto px-4 pb-4 mt-3">
						{!parsed ? (
							<div className="flex items-center justify-center h-32 text-muted-foreground">
								<p className="text-sm">No README available for custom mods</p>
							</div>
						) : loadingReadme ? (
							<div className="flex items-center justify-center h-32">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : readme ? (
							<div className="md-body">
								<ReactMarkdown
									unwrapDisallowed
									remarkPlugins={[remarkGfm]}
									rehypePlugins={[rehypeRaw, [rehypeHighlight, { ignoreMissing: true }]]}
									disallowedElements={['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'style']}
									components={{
										a: ({ href, children }) => (
											<a
												href={href}
												onClick={(e) => {
													if (href) {
														e.preventDefault();
														commandService.openExternal(href);
													}
												}}
											>
												{children}
											</a>
										)
									}}
								>
									{readme}
								</ReactMarkdown>
							</div>
						) : (
							<div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
								<p className="text-sm">No README available</p>
								{thunderstoreUrl && (
									<ExternalLinkComp href={thunderstoreUrl} className="text-xs text-primary hover:underline">
										View on Thunderstore →
									</ExternalLinkComp>
								)}
							</div>
						)}
					</TabsContent>
					<TabsContent value="changelog" className="flex-1 overflow-y-auto px-4 pb-4 mt-3">
						{!parsed ? (
							<div className="flex items-center justify-center h-32 text-muted-foreground">
								<p className="text-sm">No changelog available for custom mods</p>
							</div>
						) : loadingChangelog ? (
							<div className="flex items-center justify-center h-32">
								<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						) : changelog ? (
							<div className="md-body">
								<ReactMarkdown
									unwrapDisallowed
									remarkPlugins={[remarkGfm]}
									rehypePlugins={[rehypeRaw, [rehypeHighlight, { ignoreMissing: true }]]}
									disallowedElements={['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'style']}
									components={{
										a: ({ href, children }) => (
											<a
												href={href}
												onClick={(e) => {
													if (href) {
														e.preventDefault();
														commandService.openExternal(href);
													}
												}}
											>
												{children}
											</a>
										)
									}}
								>
									{changelog}
								</ReactMarkdown>
							</div>
						) : (
							<div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
								<p className="text-sm">No changelog available</p>
								{thunderstoreUrl && (
									<ExternalLinkComp href={thunderstoreUrl} className="text-xs text-primary hover:underline">
										View on Thunderstore →
									</ExternalLinkComp>
								)}
							</div>
						)}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
};

export default ModDetailPanel;
