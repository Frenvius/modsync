import { Tooltip, Typography } from '@mui/material';

import { SyncStatus as SyncStatusType } from '~/services/sync.service';

interface SyncStatusProps {
	onClick?: () => void;
	status: SyncStatusType;
}

const SyncStatusComponent = ({ status, onClick }: SyncStatusProps) => {
	const getStatusConfig = () => {
		switch (status) {
			case 'Host':
				return {
					label: 'Hosting',
					color: '#90caf9',
					tooltip: 'You are hosting mods for others'
				};
			case 'Synced':
				return {
					label: 'Synced',
					color: '#66bb6a',
					tooltip: 'Your mods are up to date with the host'
				};
			case 'OutOfSync':
				return {
					color: '#ffa726',
					label: 'Out of Sync',
					tooltip: 'Click to sync with host'
				};
			case 'HostOffline':
				return {
					color: '#f44336',
					label: 'Host Offline',
					tooltip: 'The host is currently offline'
				};
			case 'NotConnected':
			default:
				return {
					color: '#9e9e9e',
					label: 'Not Connected',
					tooltip: 'Join a modpack to sync mods'
				};
		}
	};

	const config = getStatusConfig();

	return (
		<Tooltip placement="top" title={config.tooltip}>
			<Typography
				component="span"
				onClick={status === 'OutOfSync' ? onClick : undefined}
				sx={{
					fontSize: 11,
					color: config.color,
					cursor: status === 'OutOfSync' ? 'pointer' : 'default',
					'&:hover': status === 'OutOfSync' ? { textDecoration: 'underline' } : {}
				}}
			>
				{config.label}
			</Typography>
		</Tooltip>
	);
};

export default SyncStatusComponent;
