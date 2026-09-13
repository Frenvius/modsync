export type CommandErrorCode =
  | 'io'
  | 'network'
  | 'conflict'
  | 'cancelled'
  | 'disk-full'
  | 'not-found'
  | 'incompatible'
  | 'invalid-input'
  | 'corrupted-data'
  | 'permission-denied'
  | 'provider-unavailable';

export interface CommandError {
  message: string;
  details?: string;
  retryable: boolean;
  code: CommandErrorCode;
}

export type OperationStatus = 'failed' | 'pending' | 'running' | 'cancelled' | 'completed';

export interface OperationProgress {
  message: string;
  totalItems: number;
  totalBytes: number;
  operationId: string;
  completedItems: number;
  status: OperationStatus;
  downloadedBytes: number;
}
