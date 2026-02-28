import React from 'react';
import { Menu } from '@mui/material';
import MenuItem from '@mui/material/MenuItem';

import styles from './styles.module.scss';
import { MenuOptionsProps } from './types';
import { fileService } from '~/services/file.service';
import { commandService } from '~/services/command.service';
import { profileService } from '~/services/profile.service';
import { AppStateContext } from '~/context/AppState/constants';

const MenuOptions: React.FC<MenuOptionsProps> = ({ anchorEl, setAnchorEl }) => {
	const open = Boolean(anchorEl);
	const { config, isInstalled, activeTmmProfile } = React.useContext(AppStateContext);

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleOpenProfileFolder = async () => {
		if (activeTmmProfile) {
			const bepinexPath = await profileService.getTmmBepinexPath(activeTmmProfile);
			const profilePath = bepinexPath.replace(/[/\\]BepInEx$/, '');
			await commandService.openFolder(profilePath);
		}
		handleClose();
	};

	const handleOpenValheimFolder = async () => {
		await commandService.openFolder(config.valheimPath);
		handleClose();
	};

	const handleUninstall = async () => {
		await fileService.uninstall();
		handleClose();
	};

	return (
		<Menu
			open={open}
			anchorEl={anchorEl}
			onClose={handleClose}
			anchorOrigin={{
				vertical: 'top',
				horizontal: 'left'
			}}
			transformOrigin={{
				vertical: 'top',
				horizontal: 'left'
			}}
		>
			<MenuItem disabled={!isInstalled} onClick={handleUninstall} className={styles.menuItem}>
				Uninstall mods
			</MenuItem>
			<MenuItem className={styles.menuItem} disabled={!activeTmmProfile} onClick={handleOpenProfileFolder}>
				Open profile folder
			</MenuItem>
			<MenuItem className={styles.menuItem} disabled={!config.valheimPath} onClick={handleOpenValheimFolder}>
				Open Valheim folder
			</MenuItem>
		</Menu>
	);
};

export default MenuOptions;
