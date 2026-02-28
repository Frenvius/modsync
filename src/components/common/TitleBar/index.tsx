import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrent } from '@tauri-apps/api/window';
import { X, Settings, ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
	Select,
	SelectItem,
	SelectValue,
	SelectContent,
	SelectTrigger,
} from '@/components/ui/select';

import MenuOptions from './Menu';
import styles from './styles.module.scss';
import JoinDialog from '~/components/JoinDialog';
import { stateService } from '~/services/state.service';
import { Modpack, syncService } from '~/services/sync.service';
import { AppStateContext } from '~/context/AppState/constants.ts';

const TitleBar: React.FC = () => {
	const location = useLocation();
	const navigate = useNavigate();
	const {
		config,
		publicIp,
		hostPort,
		isHosting,
		modpackId,
		modpackName,
		tmmProfiles,
		setHostPort,
		setIsHosting,
		setShareCode,
		setModpackId,
		setSyncStatus,
		setHostAddress,
		setModpackName,
		isShareStarting,
		activeTmmProfile,
		setIsShareStarting,
		setActiveTmmProfile
	} = React.useContext(AppStateContext);
	const [menuOpen, setMenuOpen] = React.useState(false);
	const [joinDialogOpen, setJoinDialogOpen] = React.useState(false);
	const [isConfiguring, setIsConfiguring] = React.useState(false);
	const [isPathValid, setIsPathValid] = React.useState(false);
	const triggerRef = React.useRef<HTMLButtonElement>(null);

	React.useEffect(() => {
		const checkPath = async () => {
			if (config.valheimPath) {
				const valid = await invoke<boolean>('is_valid_valheim_path', { path: config.valheimPath });
				setIsPathValid(valid);
			} else {
				setIsPathValid(false);
			}
		};
		checkPath();
	}, [config.valheimPath]);

	const handleConfigure = async () => {
		setIsConfiguring(true);
		try {
			const detectedPath = await invoke<null | string>('detect_valheim_path');
			if (detectedPath) {
				await invoke('set_config', { key: 'valheimPath', value: detectedPath });
				await stateService.dispatch('set_log', `-> Valheim folder configured: ${detectedPath}`);
			} else {
				await stateService.dispatch('set_log', '-> Could not find Valheim in default location. Please set path in Settings.');
			}
		} catch (error) {
			console.error('Failed to detect Valheim path:', error);
			await stateService.dispatch('set_log', '-> Failed to detect Valheim path.');
		} finally {
			setIsConfiguring(false);
		}
	};

	const handleClick = () => {
		setMenuOpen(true);
	};

	const handleOpenSettings = () => {
		navigate('/settings');
	};

	const handleBack = () => {
		navigate('/');
	};

	const handleProfileChange = async (name: string) => {
		if (name) {
			await setActiveTmmProfile(name);
		}
	};

	const handleShareToggle = async () => {
		if (isHosting) {
			setIsShareStarting(true);
			try {
				await syncService.stopSharing();
				setIsHosting(false);
				setShareCode('');
				setSyncStatus('NotConnected');
				await stateService.dispatch('set_log', '-> Stopped sharing');
			} catch (err) {
				await stateService.dispatch('set_log', `-> Error stopping: ${err}`);
			} finally {
				setIsShareStarting(false);
			}
		} else {
			const port = hostPort || 7878;

			if (!publicIp) {
				await stateService.dispatch('set_log', '-> Please set your Public IP in Settings first');
				return;
			}

			setIsShareStarting(true);
			try {
				await stateService.dispatch('set_log', '-> Starting share server...');
				await syncService.startSharing(port, modpackName, modpackId);
				const code = await syncService.getShareCode(publicIp, port, modpackId);
				setShareCode(code);
				setIsHosting(true);
				setSyncStatus('Host');
				await stateService.dispatch('set_log', `-> Sharing! Code: ${code}`);
			} catch (err) {
				await stateService.dispatch('set_log', `-> Error starting share: ${err}`);
				setIsShareStarting(false);
			}
		}
	};

	const handleJoined = async (code: string, host: string, port: number, modpack: Modpack, profileName: string) => {
		try {
			setShareCode(code);
			setHostAddress(host);
			setHostPort(port);
			setModpackId(modpack.id);
			setModpackName(modpack.name);

			await stateService.dispatch('set_log', `-> Joining modpack: ${modpack.name}`);
			await stateService.dispatch('set_log', `-> Syncing to profile: ${profileName}`);

			await stateService.setUpdating();
			const result = await syncService.syncMods(host, port, modpack.name, modpack.id);

			if (result.success) {
				await stateService.setInstalled();
				setSyncStatus('Synced');
				await stateService.dispatch('set_log', `-> ${result.message}`);
			}
		} catch (err) {
			await stateService.dispatch('set_log', `-> Error joining: ${err}`);
			setSyncStatus('OutOfSync');
		}
	};

	const isConfigEmpty = Object.keys(config).length === 0;
	const isHomePage = location.pathname === '/';
	const isSubPage = location.pathname === '/settings';

	return (
		<div className={styles.container}>
			{!isConfigEmpty ? (
				isHomePage ? (
					<>
						<button onClick={handleClick} className={`${styles.btn} ${styles.options}`}>
							Options
						</button>
						<Select
							value={activeTmmProfile || ''}
							onValueChange={handleProfileChange}
							disabled={tmmProfiles.length === 0}
						>
							<SelectTrigger className={`${styles.profileSelect} min-w-[80px] max-w-[120px]`}>
								<SelectValue placeholder="No profiles" />
							</SelectTrigger>
							<SelectContent>
								{tmmProfiles.length === 0 ? (
									<SelectItem value="" disabled>
										No profiles
									</SelectItem>
								) : (
									tmmProfiles.map((p) => (
										<SelectItem key={p.name} value={p.name}>
											{p.name}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</>
				) : (
					<button onClick={handleBack} className={`${styles.btn} ${styles.backButton}`}>
						<ArrowLeft className="h-[15px] w-[15px] text-[#d2d2d2]" />
					</button>
				)
			) : null}
			<MenuOptions open={menuOpen} triggerRef={triggerRef} onOpenChange={setMenuOpen} />
			<div data-tauri-drag-region className={styles.titleBar}></div>
			{isHomePage && !isConfigEmpty && (
				<>
					<button onClick={handleConfigure} disabled={isConfiguring || isPathValid} className={`${styles.btn} ${styles.configureButton}`}>
						{isConfiguring ? '...' : 'Configure'}
					</button>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								disabled={isShareStarting}
								onClick={handleShareToggle}
								className={`${styles.btn} ${styles.shareJoinButton} ${isHosting ? styles.sharing : ''}`}
							>
								{isShareStarting ? '...' : 'Share'}
							</button>
						</TooltipTrigger>
						<TooltipContent>
							{isHosting ? 'Stop sharing' : 'Start sharing'}
						</TooltipContent>
					</Tooltip>
					<button disabled={isHosting} onClick={() => setJoinDialogOpen(true)} className={`${styles.btn} ${styles.shareJoinButton}`}>
						Join
					</button>
					<button onClick={handleOpenSettings} className={`${styles.btn} ${styles.settingsButton}`}>
						<Settings className="h-[15px] w-[15px] text-[#d2d2d2]" />
					</button>
				</>
			)}
			{!isSubPage && (
				<button onClick={() => getCurrent().close()} className={`${styles.btn} ${styles.closeButton}`}>
					<X className="h-[15px] w-[15px] text-[#d2d2d2]" />
				</button>
			)}

			<JoinDialog open={joinDialogOpen} onJoined={handleJoined} onClose={() => setJoinDialogOpen(false)} />
		</div>
	);
};

export default TitleBar;
