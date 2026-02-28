import { ReactNode } from 'react';

export interface LogProviderProps {
	children: ReactNode;
}

export interface LogContextType {
	logs: string[];
	cleanLogs: () => void;
	setLog: (str: string) => void;
}
