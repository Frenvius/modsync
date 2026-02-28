import React from 'react';
import { LoadingButton } from '@mui/lab';
import { useNavigate } from 'react-router-dom';
import { Grid, TextField, Typography } from '@mui/material';

import styles from './styles.module.scss';
import { AppStateContext } from '~/context/AppState/constants';

interface SettingsProps {
	refresh?: boolean;
}

const Settings = ({ refresh }: SettingsProps) => {
	const navigate = useNavigate();
	const { config, hostPort, setConfig } = React.useContext(AppStateContext);
	const [publicIp, setPublicIp] = React.useState<string>(config.publicIp || '');
	const [port, setPort] = React.useState<number>(hostPort || 7878);
	const [valheimFolder, setValheimFolder] = React.useState<string>(config.valheimPath || '');
	const [isLoading, setIsLoading] = React.useState<boolean>(false);

	const handlePublicIpChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setPublicIp(event.target.value);
	};

	const handlePortChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setPort(Number(event.target.value));
	};

	const handleValheimFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setValheimFolder(event.target.value);
	};

	const saveSettings = async () => {
		setIsLoading(true);
		await setConfig('publicIp', publicIp);
		await setConfig('hostPort', port);
		await setConfig('valheimPath', valheimFolder);
		navigate('/');
		refresh && navigate(0);
	};

	return (
		<div className={styles.container}>
			<Grid container spacing={0.5} sx={{ height: '100%' }}>
				<Grid item xs={12} display="flex" alignItems="center" className={styles.header} justifyContent="space-between">
					<Typography className={styles.title}>Settings</Typography>
				</Grid>

				<Grid item xs={8}>
					<TextField
						fullWidth
						size="small"
						value={publicIp}
						label="Public IP"
						variant="outlined"
						disabled={isLoading}
						placeholder="123.45.67.89"
						onChange={handlePublicIpChange}
					/>
				</Grid>
				<Grid item xs={4}>
					<TextField
						fullWidth
						size="small"
						value={port}
						label="Port"
						type="number"
						variant="outlined"
						disabled={isLoading}
						onChange={handlePortChange}
					/>
				</Grid>

				<Grid item xs={12}>
					<TextField
						fullWidth
						size="small"
						variant="outlined"
						disabled={isLoading}
						value={valheimFolder}
						label="Valheim Folder"
						onChange={handleValheimFolderChange}
						placeholder="C:\Program Files (x86)\Steam\steamapps\common\Valheim"
					/>
				</Grid>

				<Grid item xs={12} display="flex" alignItems="flex-end" justifyContent="flex-end">
					<LoadingButton loading={isLoading} className={styles.saveButton} onClick={async () => await saveSettings()}>
						Save
					</LoadingButton>
				</Grid>
			</Grid>
		</div>
	);
};

export default Settings;
