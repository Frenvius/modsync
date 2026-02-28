import { createContext } from 'react';

import { ToastContextType } from './types';

export const ToastContext = createContext<null | ToastContextType>(null);
