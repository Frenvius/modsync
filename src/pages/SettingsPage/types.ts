import type { AppSettings } from '~/domain/interfaces/settings.interface';

import React from 'react';

import { SETTINGS_SECTIONS } from './constants';

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface SectionBodyProps {
  settings: AppSettings;
  section: SettingsSection;
  patch: (patch: Partial<AppSettings>) => Promise<void>;
}

export interface RowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}
