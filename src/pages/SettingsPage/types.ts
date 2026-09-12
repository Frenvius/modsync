import type { AppSettings } from '~/domain/interfaces/settings.interface';

import React from 'react';

import { SETTINGS_SECTIONS } from './constants';

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface SectionBodyProps {
  settings: AppSettings;
  section: SettingsSection;
  patch: (patch: Partial<AppSettings>) => void;
}

export interface RowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  description?: string;
  onChange: (checked: boolean) => void;
}
