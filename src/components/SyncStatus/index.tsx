import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					style={{ fontSize: 11, color: config.color }}
					onClick={status === 'OutOfSync' ? onClick : undefined}
					className={status === 'OutOfSync' ? 'cursor-pointer hover:underline' : 'cursor-default'}
				>
					{config.label}
				</span>
			</TooltipTrigger>
			<TooltipContent side="top">
				{config.tooltip}
			</TooltipContent>
		</Tooltip>
	);
};

export default SyncStatusComponent;
