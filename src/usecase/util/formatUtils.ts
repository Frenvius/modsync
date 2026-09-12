export const formatCompact = (value: number) =>
  Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export const formatSpeed = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;

export const formatRelative = (iso: null | string) => {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const formatPlaytime = (minutes: number) => {
  if (minutes === 0) return '0h';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
};

export const formatEta = (seconds: number) => {
  if (seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
};

export const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export const wait = (ms = 250) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
