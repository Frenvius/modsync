import type { GameId, LoaderId, ProviderId, ProjectType, DependencyType } from '~/domain/enums/provider.enum';

export interface Dependency {
  name: string;
  projectId: string;
  type: DependencyType;
  versionRange?: string;
}

export interface ProjectVersion {
  id: string;
  name: string;
  number: string;
  fileSize: number;
  downloads: number;
  changelog: string;
  projectId: string;
  publishedAt: string;
  loaders: Array<LoaderId>;
  gameVersions: Array<string>;
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

export interface SearchResult {
  total: number;
  items: Array<Project>;
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
