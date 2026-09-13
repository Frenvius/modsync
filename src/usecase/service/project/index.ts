import type { Game } from '~/domain/interfaces/game.interface';
import type { Instance } from '~/domain/interfaces/instance.interface';
import type {
  Project,
  Dependency,
  SearchQuery,
  SearchResult,
  ProjectVersion,
  ProviderFailure,
  CompatibilityIssue,
  CompatibilityReport
} from '~/domain/interfaces/project.interface';

import { GAMES, LOADER_NAMES } from '~/usecase/mock/games';
import { getErrorMessage } from '~/usecase/util/getErrorMessage';
import { ProjectType, DependencyType } from '~/domain/enums/provider.enum';
import { getProviderMeta, providerService } from '~/usecase/service/providers';

export interface DependencyResolution {
  optional: Array<Dependency>;
  toInstall: Array<Dependency>;
  conflicts: Array<Dependency>;
  alreadyInstalled: Array<Dependency>;
}

export interface CategoryResult {
  stale: boolean;
  items: Array<string>;
  providerErrors: Array<ProviderFailure>;
}

class Service {
  private games = GAMES;
  private versions = new Map<string, Array<ProjectVersion>>();

  setGames(games: Array<Game>): void {
    this.games = games;
  }

  getGame(gameId: Game['id']): Game {
    return this.games.find((game) => game.id === gameId) ?? this.games[0];
  }

  async getCategories(gameId: Game['id']): Promise<CategoryResult> {
    const game = this.getGame(gameId);
    const results = await Promise.allSettled(
      game.providers.map((providerId) => providerService.getCategories(providerId, gameId))
    );
    const providerErrors: Array<ProviderFailure> = [];
    const items = new Set<string>();
    let stale = false;
    results.forEach((result, index) => {
      const providerId = game.providers[index];
      if (result.status === 'rejected') {
        providerErrors.push({
          providerId,
          message: `${getProviderMeta(providerId).name}: ${getErrorMessage(result.reason, 'categories unavailable')}`
        });
        return;
      }
      stale ||= result.value.stale;
      result.value.items.forEach((item) => items.add(item));
    });
    return { stale, providerErrors, items: [...items].sort() };
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const game = this.getGame(query.gameId);
    const providers = (query.providers?.length ? query.providers : game.providers).filter((provider) =>
      game.providers.includes(provider)
    );
    const results = await Promise.allSettled(providers.map((providerId) => providerService.search(providerId, query)));
    const providerErrors: Array<ProviderFailure> = [];
    const items: Array<Project> = [];
    let total = 0;
    let stale = false;
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        providerErrors.push({
          providerId: providers[index],
          message: `${getProviderMeta(providers[index]).name}: ${getErrorMessage(result.reason, 'search unavailable')}`
        });
        return;
      }
      items.push(...result.value.items);
      total += result.value.total;
      stale ||= result.value.stale;
    });
    if (query.sort === 'downloads' || !query.sort) items.sort((a, b) => b.downloads - a.downloads);
    if (query.sort === 'updated' || query.sort === 'newest') items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items, total, stale, providerErrors };
  }

  async getProject(projectId: string): Promise<Project> {
    return providerService.getProject(projectId);
  }

  async getVersions(projectId: string): Promise<Array<ProjectVersion>> {
    const versions = await providerService.getVersions(projectId);
    this.versions.set(projectId, versions);
    return versions;
  }

  checkCompatibility(project: Project, instance: Instance): CompatibilityReport {
    const issues: Array<CompatibilityIssue> = [];
    if (project.gameId !== instance.gameId) {
      issues.push({
        kind: 'version',
        severity: 'error',
        message: `Made for ${this.getGame(project.gameId).name}, not ${this.getGame(instance.gameId).name}.`
      });
      return { issues, compatible: false };
    }
    if (project.type === ProjectType.DataPack) {
      issues.push({
        kind: 'version',
        severity: 'error',
        message: 'Data packs require a world selection and cannot be installed yet.'
      });
    }
    if (project.loaders.length > 0 && !project.loaders.includes(instance.loader)) {
      issues.push({
        kind: 'loader',
        severity: 'error',
        remediation: 'Create a new instance with a supported loader',
        message: `Requires ${project.loaders.map((loader) => LOADER_NAMES[loader]).join(' or ')}. This instance uses ${LOADER_NAMES[instance.loader]}.`
      });
    }
    if (project.gameVersions.length > 0 && !project.gameVersions.includes(instance.gameVersion)) {
      issues.push({
        kind: 'version',
        severity: 'error',
        remediation: 'Choose an instance with a supported game version',
        message: `No release for ${instance.gameVersion}. Latest supports ${project.gameVersions[0]}.`
      });
    }
    const conflicts = this.latestDependencies(project).filter(
      (dependency) =>
        dependency.type === DependencyType.Incompatible &&
        instance.mods.some((mod) => mod.projectId === dependency.projectId && mod.enabled)
    );
    for (const conflict of conflicts) {
      issues.push({
        kind: 'conflict',
        severity: 'error',
        remediation: `Disable or remove ${conflict.name}`,
        message: `Conflicts with ${conflict.name}, which is installed.`
      });
    }
    return { issues, compatible: issues.every((issue) => issue.severity !== 'error') };
  }

  resolveDependencies(project: Project, instance: Instance, version?: string): DependencyResolution {
    const dependencies = this.dependencies(project, version);
    const installed = new Set(instance.mods.map((mod) => mod.projectId));
    return {
      optional: dependencies.filter(
        (dependency) => dependency.type === DependencyType.Optional && !installed.has(dependency.projectId)
      ),
      toInstall: dependencies.filter(
        (dependency) => dependency.type === DependencyType.Required && !installed.has(dependency.projectId)
      ),
      conflicts: dependencies.filter(
        (dependency) => dependency.type === DependencyType.Incompatible && installed.has(dependency.projectId)
      ),
      alreadyInstalled: dependencies.filter(
        (dependency) => dependency.type === DependencyType.Required && installed.has(dependency.projectId)
      )
    };
  }

  private latestDependencies(project: Project): Array<Dependency> {
    return this.dependencies(project);
  }

  private dependencies(project: Project, version?: string): Array<Dependency> {
    const versions = this.versions.get(project.id) ?? [];
    return (
      (version ? versions.find((candidate) => candidate.id === version || candidate.number === version) : versions[0])
        ?.dependencies ?? []
    );
  }
}

export const projectService = new Service();
