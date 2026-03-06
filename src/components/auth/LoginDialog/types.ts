export interface DeviceCodeInfo {
	message: string;
	interval: number;
	user_code: string;
	device_code: string;
	verification_uri: string;
}

export interface MinecraftAccount {
	uuid: string;
	username: string;
	is_default: boolean;
	skin_url: null | string;
}

export interface LoginDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: (account: MinecraftAccount) => void;
}

export type LoginState = 'idle' | 'error' | 'waiting' | 'success' | 'requesting' | 'authenticating';
