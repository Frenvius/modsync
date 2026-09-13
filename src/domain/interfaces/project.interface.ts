import type { GameId, LoaderId, ProviderId, ProjectType, DependencyType } from '~/domain/enums/provider.enum';

export interface Dependency {
  name: string;
  projectId: string;
  type: DependencyType;
  versionRange?: string;
}

export interface ArtifactHash {
  value: string;
  algorithm: 'md5' | 'sha1' | 'sha512';
}

export interface ProjectVersion {
  id: string;
  name: string;
  number: string;
  fileSize: number;
  downloads: number;
  changelog: string;
  projectId: string;
  fileName?: string;
  publishedAt: string;
  downloadUrl?: string;
  loaders: Array<LoaderId>;
  gameVersions: Array<string>;
  hashes?: Array<ArtifactHash>;
  dependencies: Array<Dependency>;
}

export interface ProjectProviderInfo {
  url: string;
  id: ProviderId;
  externalId: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  author: string;
  gameId: GameId;
  summary: string;
  iconUrl?: string;
  iconColor: string;
  updatedAt: string;
  downloads: number;
  followers: number;
  type: ProjectType;
  description: string;
  latestVersion: string;
  gallery: Array<string>;
  loaders: Array<LoaderId>;
  categories: Array<string>;
  gameVersions: Array<string>;
  provider: ProjectProviderInfo;
}

export interface SearchQuery {
  page?: number;
  query?: string;
  gameId: GameId;
  loader?: LoaderId;
  sort?: SearchSort;
  category?: string;
  gameVersion?: string;
  providers?: Array<ProviderId>;
}

export type SearchSort = 'newest' | 'updated' | 'relevance' | 'downloads';

export interface ProviderFailure {
  message: string;
  providerId: ProviderId;
}

export interface SearchResult {
  total: number;
  stale: boolean;
  items: Array<Project>;
  providerErrors: Array<ProviderFailure>;
}

export interface CompatibilityIssue {
  message: string;
  remediation?: string;
  severity: 'error' | 'warning';
  kind: 'loader' | 'version' | 'conflict' | 'dependency';
}

export interface CompatibilityReport {
  compatible: boolean;
  issues: Array<CompatibilityIssue>;
}
