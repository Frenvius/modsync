import React from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

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
			<div className="grid gap-2 h-full">
				<div className="flex items-center justify-between">
					<span className={styles.title}>Settings</span>
				</div>

				<div className="grid grid-cols-12 gap-2">
					<div className="col-span-8 space-y-1">
						<Label htmlFor="publicIp" className="text-xs text-[#d2d2d2]">Public IP</Label>
						<Input
							id="publicIp"
							value={publicIp}
							disabled={isLoading}
							className="h-8 text-xs"
							placeholder="123.45.67.89"
							onChange={handlePublicIpChange}
						/>
					</div>
					<div className="col-span-4 space-y-1">
						<Label htmlFor="port" className="text-xs text-[#d2d2d2]">Port</Label>
						<Input
							id="port"
							value={port}
							type="number"
							disabled={isLoading}
							className="h-8 text-xs"
							onChange={handlePortChange}
						/>
					</div>
				</div>

				<div className="space-y-1">
					<Label htmlFor="valheimPath" className="text-xs text-[#d2d2d2]">Valheim Folder</Label>
					<Input
						id="valheimPath"
						disabled={isLoading}
						value={valheimFolder}
						className="h-8 text-xs"
						onChange={handleValheimFolderChange}
						placeholder="C:\Program Files (x86)\Steam\steamapps\common\Valheim"
					/>
				</div>

				<div className="flex items-end justify-end">
					<Button
						disabled={isLoading}
						className={styles.saveButton}
						onClick={async () => await saveSettings()}
					>
						{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Save
					</Button>
				</div>
			</div>
		</div>
	);
};

export default Settings;
