import { convertFileSrc } from '@tauri-apps/api/core';

export const getIconSrc = (iconUrl: string | null | undefined): string | undefined => {
  if (!iconUrl) return undefined;
  if (iconUrl.startsWith('http://') || iconUrl.startsWith('https://')) {
    return iconUrl;
  }
  return convertFileSrc(iconUrl);
};
