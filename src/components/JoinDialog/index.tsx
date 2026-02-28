import React from 'react';
import { Dialog } from '@mui/material';

import styles from './styles.module.scss';
import { stateService } from '~/services/state.service';
import { profileService } from '~/services/profile.service';
import { AppStateContext } from '~/context/AppState/constants';
import { Modpack, ShareCode, syncService } from '~/services/sync.service';

interface JoinDialogProps {
	open: boolean;
	onClose: () => void;
	onJoined: (shareCode: string, host: string, port: number, modpack: Modpack, profileName: string) => void;
}

const JoinDialog = ({ open, onClose, onJoined }: JoinDialogProps) => {
	const { activeTmmProfile, refreshTmmProfiles, setActiveTmmProfile } = React.useContext(AppStateContext);
	const [shareCode, setShareCode] = React.useState('');
	const [isJoining, setIsJoining] = React.useState(false);
	const [error, setError] = React.useState('');

	const handleJoin = async () => {
		if (!shareCode.trim()) {
			setError('Enter a share code');
			return;
		}

		setIsJoining(true);
		setError('');

		try {
			const info: ShareCode = await syncService.decodeShareCode(shareCode);
			await stateService.dispatch('set_log', `-> Connecting to ${info.host}:${info.port}...`);

			handleClose();

			const modpack: Modpack = await syncService.joinModpack(shareCode);
			await stateService.dispatch('set_log', `-> Found: ${modpack.name} (${modpack.mods.length} mods)`);

			let profileToUse = activeTmmProfile;
			if (!profileToUse) {
				await stateService.dispatch('set_log', `-> Creating profile: ${modpack.name}...`);
				const newProfile = await profileService.createTmmProfile(modpack.name);
				await refreshTmmProfiles();
				await setActiveTmmProfile(newProfile.name);
				profileToUse = newProfile.name;
			}

			onJoined(shareCode, info.host, info.port, modpack, profileToUse);
		} catch (err) {
			await stateService.dispatch('set_log', `-> Join failed: ${err}`);
			setIsJoining(false);
		}
	};

	const handleClose = () => {
		setShareCode('');
		setError('');
		setIsJoining(false);
		onClose();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && shareCode.trim() && !isJoining) {
			handleJoin();
		} else if (e.key === 'Escape') {
			handleClose();
		}
	};

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			PaperProps={{
				className: styles.dialog
			}}
			BackdropProps={{
				className: styles.backdrop
			}}
		>
			<div className={styles.content}>
				<span className={styles.label}>Join Modpack</span>
				<input
					autoFocus
					type="text"
					value={shareCode}
					disabled={isJoining}
					className={styles.input}
					onKeyDown={handleKeyDown}
					placeholder="Paste share code"
					onChange={(e) => setShareCode(e.target.value)}
				/>
				{error && <span className={styles.error}>{error}</span>}
				<div className={styles.actions}>
					<button onClick={handleClose} className={styles.btn}>
						Cancel
					</button>
					<button onClick={handleJoin} disabled={isJoining || !shareCode.trim()} className={`${styles.btn} ${styles.primary}`}>
						{isJoining ? '...' : 'Join'}
					</button>
				</div>
			</div>
		</Dialog>
	);
};

export default JoinDialog;
