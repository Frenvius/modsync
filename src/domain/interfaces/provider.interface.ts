import type { GameId, ProviderId } from '~/domain/enums/provider.enum';
import type { Project, SearchQuery, SearchResult, ProjectVersion } from '~/domain/interfaces/project.interface';

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  color: string;
  website: string;
  games: Array<GameId>;
  requiresApiKey: boolean;
}

export interface ModProvider {
  meta: ProviderMeta;
  search: (query: SearchQuery) => Promise<SearchResult>;
  getProject: (projectId: string) => Promise<Project | undefined>;
  getVersions: (projectId: string) => Promise<Array<ProjectVersion>>;
}
