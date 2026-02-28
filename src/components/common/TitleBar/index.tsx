import React, { MouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import CloseIcon from '@mui/icons-material/Close';
import { getCurrent } from '@tauri-apps/api/window';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Select, Tooltip, MenuItem } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

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
	const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
	const [joinDialogOpen, setJoinDialogOpen] = React.useState(false);
	const [isConfiguring, setIsConfiguring] = React.useState(false);
	const [isPathValid, setIsPathValid] = React.useState(false);

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

	const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleOpenSettings = () => {
		navigate('/settings');
	};

	const handleBack = () => {
		navigate('/');
	};

	const handleProfileChange = async (event: any) => {
		const name = event.target.value;
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
							size="small"
							displayEmpty
							value={activeTmmProfile || ''}
							onChange={handleProfileChange}
							className={styles.profileSelect}
							disabled={tmmProfiles.length === 0}
							MenuProps={{
								PaperProps: {
									sx: {
										backgroundColor: '#323232',
										'& .MuiList-root': {
											padding: '4px 0'
										},
										'& .MuiMenuItem-root': {
											fontSize: 11,
											color: '#d2d2d2',
											minHeight: 'unset',
											padding: '4px 12px',
											'&:hover': {
												backgroundColor: '#404040'
											},
											'&.Mui-selected': {
												backgroundColor: '#505050',
												'&:hover': {
													backgroundColor: '#505050'
												}
											}
										}
									}
								}
							}}
							sx={{
								height: 24,
								minWidth: 80,
								fontSize: 11,
								maxWidth: 120,
								color: '#d2d2d2',
								backgroundColor: '#323232',
								'&:hover': {
									backgroundColor: '#404040'
								},
								'& .MuiOutlinedInput-notchedOutline': {
									border: 'none'
								},
								'& .MuiSvgIcon-root': {
									right: 4,
									fontSize: 16,
									color: '#d2d2d2'
								},
								'& .MuiSelect-select': {
									height: '24px',
									display: 'flex',
									lineHeight: '24px',
									alignItems: 'center',
									padding: '0 24px 0 8px !important'
								}
							}}
						>
							{tmmProfiles.length === 0 ? (
								<MenuItem value="" disabled>
									No profiles
								</MenuItem>
							) : (
								tmmProfiles.map((p) => (
									<MenuItem key={p.name} value={p.name}>
										{p.name}
									</MenuItem>
								))
							)}
						</Select>
					</>
				) : (
					<button onClick={handleBack} className={`${styles.btn} ${styles.backButton}`}>
						<ArrowBackIcon sx={{ fontSize: 15, color: '#d2d2d2' }} />
					</button>
				)
			) : null}
			<MenuOptions anchorEl={anchorEl} setAnchorEl={setAnchorEl} />
			<div data-tauri-drag-region className={styles.titleBar}></div>
			{isHomePage && !isConfigEmpty && (
				<>
					<button onClick={handleConfigure} disabled={isConfiguring || isPathValid} className={`${styles.btn} ${styles.configureButton}`}>
						{isConfiguring ? '...' : 'Configure'}
					</button>
					<Tooltip title={isHosting ? 'Stop sharing' : 'Start sharing'}>
						<button
							disabled={isShareStarting}
							onClick={handleShareToggle}
							className={`${styles.btn} ${styles.shareJoinButton} ${isHosting ? styles.sharing : ''}`}
						>
							{isShareStarting ? '...' : 'Share'}
						</button>
					</Tooltip>
					<button disabled={isHosting} onClick={() => setJoinDialogOpen(true)} className={`${styles.btn} ${styles.shareJoinButton}`}>
						Join
					</button>
					<button onClick={handleOpenSettings} className={`${styles.btn} ${styles.settingsButton}`}>
						<SettingsIcon sx={{ fontSize: 15, color: '#d2d2d2' }} />
					</button>
				</>
			)}
			{!isSubPage && (
				<button onClick={() => getCurrent().close()} className={`${styles.btn} ${styles.closeButton}`}>
					<CloseIcon sx={{ fontSize: 15, color: '#d2d2d2' }} />
				</button>
			)}

			<JoinDialog open={joinDialogOpen} onJoined={handleJoined} onClose={() => setJoinDialogOpen(false)} />
		</div>
	);
};

export default TitleBar;
