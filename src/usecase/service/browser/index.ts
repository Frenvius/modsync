import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

export const getExternalWebUrl = (href: string, appOrigin: string): string | undefined => {
  const url = new URL(href, appOrigin);
  return ['http:', 'https:'].includes(url.protocol) && url.origin !== appOrigin ? url.href : undefined;
};

class Service {
  async openExternal(url: string): Promise<void> {
    const externalUrl = getExternalWebUrl(url, window.location.origin);
    if (!externalUrl) throw new Error('Only external web links can be opened');
    if (isTauri()) {
      await openUrl(externalUrl);
      return;
    }
    window.open(externalUrl, '_blank', 'noopener,noreferrer');
  }
}

export const browserService = new Service();
