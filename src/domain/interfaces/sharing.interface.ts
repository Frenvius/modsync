export interface SharingStatus {
  code?: string;
  active: boolean;
  instanceId?: string;
}

export interface SharingProgress {
  message: string;
  totalItems: number;
  operationId: string;
  completedItems: number;
  status: 'failed' | 'pending' | 'running' | 'completed' | 'cancelled';
}
