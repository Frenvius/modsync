import React from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardTitle, CardHeader, CardContent } from '@/components/ui/card';
import { Lock, Search, Loader2, FileText, ChevronDown, ChevronRight } from 'lucide-react';

import { useToast } from '~/components/Toast';
import ConfigEntryComponent from './ConfigEntry';
import { AppStateContext } from '~/context/AppState/constants';
import { ConfigFile, ConfigSection, configService, ConfigFileSummary } from '~/services/config.service';

const ConfigEditor: React.FC = () => {
	const toast = useToast();
	const { isReadOnly, activeTmmProfile } = React.useContext(AppStateContext);

	const [configFiles, setConfigFiles] = React.useState<ConfigFileSummary[]>([]);
	const [selectedFile, setSelectedFile] = React.useState<null | ConfigFile>(null);
	const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set());
	const [searchQuery, setSearchQuery] = React.useState('');
	const [isLoading, setIsLoading] = React.useState(false);
	const [isLoadingFile, setIsLoadingFile] = React.useState(false);

	const loadConfigFiles = React.useCallback(async () => {
		if (!activeTmmProfile) return;

		setIsLoading(true);
		try {
			const summaries = await configService.getConfigSummaries(activeTmmProfile);
			setConfigFiles(summaries);
		} catch (err) {
			toast.error('Failed to load configs', String(err));
		} finally {
			setIsLoading(false);
		}
	}, [activeTmmProfile, toast]);

	React.useEffect(() => {
		loadConfigFiles();
	}, [loadConfigFiles]);

	const handleSelectFile = async (path: string) => {
		setIsLoadingFile(true);
		try {
			const config = await configService.parseConfigFile(path);
			setSelectedFile(config);
			if (config.sections.length > 0) {
				setExpandedSections(new Set([config.sections[0].name]));
			}
		} catch (err) {
			toast.error('Failed to load config', String(err));
		} finally {
			setIsLoadingFile(false);
		}
	};

	const toggleSection = (sectionName: string) => {
		setExpandedSections((prev) => {
			const next = new Set(prev);
			if (next.has(sectionName)) {
				next.delete(sectionName);
			} else {
				next.add(sectionName);
			}
			return next;
		});
	};

	const handleValueChange = async (sectionName: string, key: string, value: string) => {
		if (!selectedFile) return;

		try {
			await configService.setConfigEntry(selectedFile.path, sectionName, key, value);

			const updated = await configService.parseConfigFile(selectedFile.path);
			setSelectedFile(updated);
		} catch (err) {
			toast.error('Failed to save', String(err));
		}
	};

	const handleReset = async (sectionName: string, key: string) => {
		if (!selectedFile) return;

		try {
			const newValue = await configService.resetConfigEntry(selectedFile.path, sectionName, key);
			toast.success('Reset to default', `${key} = ${newValue}`);

			const updated = await configService.parseConfigFile(selectedFile.path);
			setSelectedFile(updated);
		} catch (err) {
			toast.error('Failed to reset', String(err));
		}
	};

	const filterSections = (sections: ConfigSection[]): ConfigSection[] => {
		if (!searchQuery) return sections;

		const query = searchQuery.toLowerCase();
		return sections
			.map((section) => ({
				...section,
				entries: section.entries.filter(
					(entry) => entry.key.toLowerCase().includes(query) || entry.description?.toLowerCase().includes(query)
				)
			}))
			.filter((section) => section.entries.length > 0);
	};

	if (!activeTmmProfile) {
		return (
			<div className="flex flex-col h-full items-center justify-center text-muted-foreground">
				<FileText className="h-12 w-12 mb-2" />
				<p>No profile selected</p>
				<p className="text-sm">Select a profile to edit configs</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full gap-4">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Config Editor</h1>
				<p className="text-sm text-muted-foreground">Edit BepInEx mod configuration files</p>
			</div>

			{isReadOnly && (
				<div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500">
					<Lock className="h-4 w-4 shrink-0" />
					<span className="text-sm">Read-only mode - You are synced to someone else's modpack. Config changes are disabled.</span>
				</div>
			)}

			<div className="flex gap-4 flex-1 min-h-0">
				<div className="w-64 shrink-0 flex flex-col gap-2">
					<Card className="glass flex-1 overflow-hidden">
						<CardHeader className="py-3 px-4">
							<CardTitle className="text-sm">Config Files</CardTitle>
						</CardHeader>
						<CardContent className="p-0 overflow-y-auto max-h-[calc(100vh-280px)]">
							{isLoading ? (
								<div className="flex items-center justify-center p-4">
									<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
								</div>
							) : configFiles.length === 0 ? (
								<p className="p-4 text-sm text-muted-foreground">No config files found</p>
							) : (
								<div className="divide-y divide-border">
									{configFiles.map((file) => (
										<button
											key={file.path}
											onClick={() => handleSelectFile(file.path)}
											className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors ${
												selectedFile?.path === file.path ? 'bg-muted' : ''
											}`}
										>
											<p className="font-medium text-sm truncate">{file.mod_name || file.filename}</p>
											<p className="text-xs text-muted-foreground">{file.entry_count} settings</p>
										</button>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				<div className="flex-1 flex flex-col gap-3 min-w-0">
					{selectedFile ? (
						<>
							<div className="flex items-center gap-3">
								<div className="relative flex-1">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										className="pl-10"
										value={searchQuery}
										placeholder="Search settings..."
										onChange={(e) => setSearchQuery(e.target.value)}
									/>
								</div>
							</div>

							<Card className="glass flex-1 overflow-y-auto">
								<CardHeader className="py-3 px-4 border-b border-border">
									<CardTitle className="text-base">{selectedFile.mod_name || selectedFile.filename}</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									{isLoadingFile ? (
										<div className="flex items-center justify-center p-8">
											<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
										</div>
									) : (
										filterSections(selectedFile.sections).map((section) => (
											<div key={section.name} className="border-b border-border last:border-b-0">
												<button
													onClick={() => toggleSection(section.name)}
													className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors"
												>
													{expandedSections.has(section.name) ? (
														<ChevronDown className="h-4 w-4 text-muted-foreground" />
													) : (
														<ChevronRight className="h-4 w-4 text-muted-foreground" />
													)}
													<span className="font-medium">{section.name}</span>
													<span className="text-xs text-muted-foreground ml-auto">{section.entries.length} settings</span>
												</button>
												{expandedSections.has(section.name) && (
													<div className="px-4 pb-2">
														{section.entries.map((entry) => (
															<ConfigEntryComponent
																entry={entry}
																key={entry.key}
																disabled={isReadOnly}
																onReset={(key) => handleReset(section.name, key)}
																onValueChange={(key, value) => handleValueChange(section.name, key, value)}
															/>
														))}
													</div>
												)}
											</div>
										))
									)}
								</CardContent>
							</Card>
						</>
					) : (
						<div className="flex-1 flex items-center justify-center text-muted-foreground">
							<div className="text-center">
								<FileText className="h-12 w-12 mx-auto mb-2" />
								<p>Select a config file to edit</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default ConfigEditor;
