import { ReactNode } from 'react';
import { Update } from '@tauri-apps/plugin-updater';

import { Config } from '~/context/AppState/types.ts';

export interface AppProvidersProps {
	data: Config;
	children: ReactNode;
	update: null | Update;
}
