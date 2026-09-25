export interface AvailableUpdate {
  notes: string;
  version: string;
  currentVersion: string;
}

export interface UpdateProgress {
  total: number;
  downloaded: number;
}
