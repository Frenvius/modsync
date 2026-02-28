import React from 'react';
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import styles from './styles.module.scss';
import { MenuOptionsProps } from './types';
import { fileService } from '~/services/file.service';
import { commandService } from '~/services/command.service';
import { profileService } from '~/services/profile.service';
import { AppStateContext } from '~/context/AppState/constants';

interface Props extends Omit<MenuOptionsProps, 'anchorEl' | 'setAnchorEl'> {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	triggerRef: React.RefObject<HTMLButtonElement>;
}

const MenuOptions: React.FC<Props> = ({ open, triggerRef, onOpenChange }) => {
	const { config, isInstalled, activeTmmProfile } = React.useContext(AppStateContext);

	const handleClose = () => {
		onOpenChange(false);
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
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<span ref={triggerRef as React.RefObject<HTMLSpanElement>} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className={styles.menuContent}>
				<DropdownMenuItem
					disabled={!isInstalled}
					onClick={handleUninstall}
					className={styles.menuItem}
				>
					Uninstall mods
				</DropdownMenuItem>
				<DropdownMenuItem
					className={styles.menuItem}
					disabled={!activeTmmProfile}
					onClick={handleOpenProfileFolder}
				>
					Open profile folder
				</DropdownMenuItem>
				<DropdownMenuItem
					className={styles.menuItem}
					disabled={!config.valheimPath}
					onClick={handleOpenValheimFolder}
				>
					Open Valheim folder
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default MenuOptions;
