import React from 'react';
import { cn } from '@/lib/utils';
import { X, Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

import { ToastContext } from '~/context/ToastContext';
import { Toast as ToastType, ToastType as ToastVariant } from '~/context/ToastContext/types';

const iconMap: Record<ToastVariant, React.ReactNode> = {
	info: <Info className="h-5 w-5" />,
	error: <AlertCircle className="h-5 w-5" />,
	success: <CheckCircle className="h-5 w-5" />,
	warning: <AlertTriangle className="h-5 w-5" />
};

const styleMap: Record<ToastVariant, string> = {
	error: 'bg-red-500/10 border-red-500/50 text-red-400',
	info: 'bg-blue-500/10 border-blue-500/50 text-blue-400',
	success: 'bg-green-500/10 border-green-500/50 text-green-400',
	warning: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
};

interface ToastItemProps {
	toast: ToastType;
	onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
	return (
		<div
			role="alert"
			className={cn(
				'flex items-start gap-3 p-4 rounded-lg border backdrop-blur-xl shadow-lg',
				'animate-in slide-in-from-right-full duration-300',
				styleMap[toast.type]
			)}
		>
			<div className="flex-shrink-0">{iconMap[toast.type]}</div>
			<div className="flex-1 min-w-0">
				<p className="font-medium text-sm text-foreground">{toast.title}</p>
				{toast.message && <p className="mt-1 text-sm text-muted-foreground">{toast.message}</p>}
			</div>
			{toast.dismissible && (
				<button
					aria-label="Dismiss"
					onClick={() => onDismiss(toast.id)}
					className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
				>
					<X className="h-4 w-4" />
				</button>
			)}
		</div>
	);
};

export const ToastContainer: React.FC = () => {
	const context = React.useContext(ToastContext);

	if (!context) {
		return null;
	}

	const { toasts, removeToast } = context;

	if (toasts.length === 0) {
		return null;
	}

	return (
		<div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
			{toasts.map((toast) => (
				<ToastItem toast={toast} key={toast.id} onDismiss={removeToast} />
			))}
		</div>
	);
};

export const useToast = () => {
	const context = React.useContext(ToastContext);

	if (!context) {
		throw new Error('useToast must be used within a ToastProvider');
	}

	return context;
};

export default ToastContainer;
