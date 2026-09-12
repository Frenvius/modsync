import type { ProviderId } from '~/domain/enums/provider.enum';
import type { ModProvider, ProviderMeta } from '~/domain/interfaces/provider.interface';
import type { Project, SearchQuery, SearchResult, ProjectVersion } from '~/domain/interfaces/project.interface';

import { PROVIDERS } from '~/usecase/mock/games';
import { wait } from '~/usecase/util/formatUtils';
import { PROJECTS, PROJECT_VERSIONS } from '~/usecase/mock/projects';

const SORTERS: Record<NonNullable<SearchQuery['sort']>, (a: Project, b: Project) => number> = {
  relevance: (a, b) => b.downloads - a.downloads,
  downloads: (a, b) => b.downloads - a.downloads,
  newest: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt)
};

const matches = (project: Project, query: SearchQuery) => {
  if (project.gameId !== query.gameId) return false;
  if (query.category && !project.categories.includes(query.category)) return false;
  if (query.gameVersion && !project.gameVersions.includes(query.gameVersion)) return false;
  if (query.loader && project.loaders.length > 0 && !project.loaders.includes(query.loader)) return false;
  if (query.query) {
    const q = query.query.toLowerCase();
    return (
      project.name.toLowerCase().includes(q) ||
      project.summary.toLowerCase().includes(q) ||
      project.author.toLowerCase().includes(q)
    );
  }
  return true;
};

class MockProvider implements ModProvider {
  constructor(public meta: ProviderMeta) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    await wait(120 + Math.random() * 180);
    const items = PROJECTS.filter((p) => p.provider.id === this.meta.id && matches(p, query)).sort(
      SORTERS[query.sort ?? 'relevance']
    );
    return { items, total: items.length };
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    await wait();
    return PROJECTS.find((p) => p.id === projectId && p.provider.id === this.meta.id);
  }

  async getVersions(projectId: string): Promise<Array<ProjectVersion>> {
    await wait();
    return PROJECT_VERSIONS[projectId] ?? [];
  }
}

export const providerRegistry: Record<ProviderId, ModProvider> = Object.fromEntries(
  PROVIDERS.map((meta) => [meta.id, new MockProvider(meta)])
) as Record<ProviderId, ModProvider>;

export const getProviderMeta = (id: ProviderId): ProviderMeta => providerRegistry[id].meta;
