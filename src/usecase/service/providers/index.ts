import type { GameId, ProviderId } from '~/domain/enums/provider.enum';
import type { ProviderMeta, ProviderCategories } from '~/domain/interfaces/provider.interface';
import type { Project, SearchQuery, ProjectVersion } from '~/domain/interfaces/project.interface';

import { invoke, isTauri } from '@tauri-apps/api/core';

import { PROVIDERS } from '~/usecase/mock/games';

interface ProviderSearchResult {
  total: number;
  stale: boolean;
  items: Array<Project>;
}

let providers = PROVIDERS;

const requireDesktop = () => {
  if (!isTauri()) throw new Error('Provider discovery requires the ModSync desktop app.');
};

const providerFromProjectId = (projectId: string): ProviderId => {
  const providerId = projectId.split(':', 1)[0] as ProviderId;
  if (!providers.some((provider) => provider.id === providerId)) throw new Error('Unknown project provider.');
  return providerId;
};

export const providerService = {
  setProviders(nextProviders: Array<ProviderMeta>) {
    providers = nextProviders;
  },

  async getProject(projectId: string): Promise<Project> {
    requireDesktop();
    return invoke<Project>('get_provider_project', { projectId, providerId: providerFromProjectId(projectId) });
  },

  async getCategories(providerId: ProviderId, gameId: GameId): Promise<ProviderCategories> {
    requireDesktop();
    return invoke<ProviderCategories>('get_provider_categories', { gameId, providerId });
  },

  async search(providerId: ProviderId, query: SearchQuery): Promise<ProviderSearchResult> {
    requireDesktop();
    return invoke<ProviderSearchResult>('search_provider', { query: { ...query, providerId } });
  },

  async getVersions(projectId: string): Promise<Array<ProjectVersion>> {
    requireDesktop();
    return invoke<Array<ProjectVersion>>('get_provider_versions', { projectId, providerId: providerFromProjectId(projectId) });
  }
};

export const getProviderMeta = (id: ProviderId): ProviderMeta => {
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  return provider;
};
