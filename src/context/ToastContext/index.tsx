import React from 'react';

import { ToastContext } from './constants';
import { Toast, ToastType, ToastProviderProps } from './types';

const DEFAULT_DURATION = 5000;

const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
	const [toasts, setToasts] = React.useState<Toast[]>([]);

	const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

	const addToast = React.useCallback((toast: Omit<Toast, 'id'>): string => {
		const id = generateId();
		const newToast: Toast = {
			id,
			dismissible: true,
			duration: DEFAULT_DURATION,
			...toast
		};

		setToasts((prev) => [...prev, newToast]);

		if (newToast.duration && newToast.duration > 0) {
			setTimeout(() => {
				removeToast(id);
			}, newToast.duration);
		}

		return id;
	}, []);

	const removeToast = React.useCallback((id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	const clearToasts = React.useCallback(() => {
		setToasts([]);
	}, []);

	const createToastHelper = React.useCallback(
		(type: ToastType) => (title: string, message?: string) => {
			return addToast({ type, title, message });
		},
		[addToast]
	);

	const success = createToastHelper('success');
	const error = createToastHelper('error');
	const warning = createToastHelper('warning');
	const info = createToastHelper('info');

	return (
		<ToastContext.Provider
			value={{
				info,
				error,
				toasts,
				success,
				warning,
				addToast,
				removeToast,
				clearToasts
			}}
		>
			{children}
		</ToastContext.Provider>
	);
};

export default ToastProvider;
export { ToastContext } from './constants';
export type { Toast, ToastType, ToastContextType } from './types';
