import type { CompatibilityIssue } from '~/domain/interfaces/project.interface';
import type { LoaderId, ProviderId, UpdateStatus } from '~/domain/enums/provider.enum';

export interface ProviderBadgeProps {
  compact?: boolean;
  className?: string;
  providerId: ProviderId;
}

export interface VersionBadgeProps {
  version: string;
  loader?: LoaderId;
  className?: string;
}

export interface UpdateBadgeProps {
  className?: string;
  status: UpdateStatus;
}

export interface CompatibilityBadgeProps {
  className?: string;
  issues: Array<CompatibilityIssue>;
}
