import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const formatDownloads = (downloads: number): string => {
  if (downloads >= 1_000_000) {
    return `${(downloads / 1_000_000).toFixed(1)}M`;
  } else if (downloads >= 1_000) {
    return `${(downloads / 1_000).toFixed(1)}K`;
  }
  return downloads.toString();
};

export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};
