export type ToastType = 'info' | 'error' | 'success' | 'warning';

export interface Toast {
	id: string;
	title: string;
	type: ToastType;
	message?: string;
	duration?: number;
	dismissible?: boolean;
}

export interface ToastContextType {
	toasts: Toast[];
	clearToasts: () => void;
	removeToast: (id: string) => void;
	addToast: (toast: Omit<Toast, 'id'>) => string;
	info: (title: string, message?: string) => string;
	error: (title: string, message?: string) => string;
	success: (title: string, message?: string) => string;
	warning: (title: string, message?: string) => string;
}

export interface ToastProviderProps {
	children: React.ReactNode;
}
