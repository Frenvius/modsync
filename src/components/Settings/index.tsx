import React from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, CardHeader, CardContent, CardDescription } from '@/components/ui/card';

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
		<div className="flex flex-col h-full gap-6">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Settings</h1>
				<p className="text-sm text-muted-foreground">Configure your mod updater preferences</p>
			</div>

			<Card className="glass">
				<CardHeader>
					<CardTitle className="text-lg">Network Settings</CardTitle>
					<CardDescription>Configure sharing and connection settings</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-12 gap-4">
						<div className="col-span-8 space-y-2">
							<Label htmlFor="publicIp">Public IP</Label>
							<Input id="publicIp" value={publicIp} disabled={isLoading} placeholder="123.45.67.89" onChange={handlePublicIpChange} />
						</div>
						<div className="col-span-4 space-y-2">
							<Label htmlFor="port">Port</Label>
							<Input id="port" value={port} type="number" disabled={isLoading} onChange={handlePortChange} />
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="glass">
				<CardHeader>
					<CardTitle className="text-lg">Game Settings</CardTitle>
					<CardDescription>Configure your Valheim installation</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="valheimPath">Valheim Folder</Label>
						<Input
							id="valheimPath"
							disabled={isLoading}
							value={valheimFolder}
							onChange={handleValheimFolderChange}
							placeholder="C:\Program Files (x86)\Steam\steamapps\common\Valheim"
						/>
					</div>
				</CardContent>
			</Card>

			<div className="flex justify-end">
				<Button size="lg" variant="glow" disabled={isLoading} onClick={async () => await saveSettings()}>
					{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					Save Settings
				</Button>
			</div>
		</div>
	);
};

export default Settings;
