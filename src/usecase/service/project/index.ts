import type { Game } from '~/domain/interfaces/game.interface';
import type { Instance } from '~/domain/interfaces/instance.interface';
import type {
  Project,
  Dependency,
  SearchQuery,
  SearchResult,
  ProjectVersion,
  CompatibilityIssue,
  CompatibilityReport
} from '~/domain/interfaces/project.interface';

import { GAMES, LOADER_NAMES } from '~/usecase/mock/games';
import { providerRegistry } from '~/usecase/service/providers';
import { LoaderId, DependencyType } from '~/domain/enums/provider.enum';
import { PROJECTS, PROJECT_VERSIONS, CATEGORIES_BY_GAME } from '~/usecase/mock/projects';

export interface DependencyResolution {
  optional: Array<Dependency>;
  toInstall: Array<Dependency>;
  conflicts: Array<Dependency>;
  alreadyInstalled: Array<Dependency>;
}

class Service {
  private games = GAMES;

  setGames(games: Array<Game>): void {
    this.games = games;
  }

  getGame(gameId: Game['id']): Game {
    return this.games.find((game) => game.id === gameId) ?? this.games[0];
  }

  getCategories(gameId: Game['id']): Array<string> {
    return CATEGORIES_BY_GAME[gameId];
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const game = this.getGame(query.gameId);
    const providers = (query.providers?.length ? query.providers : game.providers).filter((p) => game.providers.includes(p));
    const results = await Promise.all(providers.map((id) => providerRegistry[id].search(query)));
    const items = results.flatMap((r) => r.items);
    if (query.sort === 'downloads' || !query.sort) items.sort((a, b) => b.downloads - a.downloads);
    if (query.sort === 'updated' || query.sort === 'newest') items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items, total: items.length };
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const local = PROJECTS.find((p) => p.id === projectId);
    if (!local) return undefined;
    return providerRegistry[local.provider.id].getProject(projectId);
  }

  async getVersions(projectId: string): Promise<Array<ProjectVersion>> {
    const local = PROJECTS.find((p) => p.id === projectId);
    if (!local) return [];
    return providerRegistry[local.provider.id].getVersions(projectId);
  }

  async getFeatured(): Promise<Array<Project>> {
    return [...PROJECTS].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
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
    if (project.loaders.length > 0 && instance.loader !== LoaderId.Vanilla && !project.loaders.includes(instance.loader)) {
      issues.push({
        kind: 'loader',
        severity: 'error',
        remediation: 'Create a new instance with a supported loader',
        message: `Requires ${project.loaders.map((l) => LOADER_NAMES[l]).join(' or ')}. This instance uses ${LOADER_NAMES[instance.loader]}.`
      });
    }
    if (!project.gameVersions.includes(instance.gameVersion)) {
      issues.push({
        kind: 'version',
        severity: 'warning',
        remediation: 'Install anyway at your own risk, or change the instance version',
        message: `No release for ${instance.gameVersion}. Latest supports ${project.gameVersions[0]}.`
      });
    }
    const conflicts = this.latestDependencies(project).filter(
      (d) => d.type === DependencyType.Incompatible && instance.mods.some((m) => m.projectId === d.projectId && m.enabled)
    );
    for (const c of conflicts) {
      issues.push({
        kind: 'conflict',
        severity: 'error',
        remediation: `Disable or remove ${c.name}`,
        message: `Conflicts with ${c.name}, which is installed.`
      });
    }
    return { issues, compatible: issues.every((i) => i.severity !== 'error') };
  }

  resolveDependencies(project: Project, instance: Instance): DependencyResolution {
    const deps = this.latestDependencies(project);
    const installed = new Set(instance.mods.map((m) => m.projectId));
    return {
      optional: deps.filter((d) => d.type === DependencyType.Optional && !installed.has(d.projectId)),
      toInstall: deps.filter((d) => d.type === DependencyType.Required && !installed.has(d.projectId)),
      conflicts: deps.filter((d) => d.type === DependencyType.Incompatible && installed.has(d.projectId)),
      alreadyInstalled: deps.filter((d) => d.type === DependencyType.Required && installed.has(d.projectId))
    };
  }

  private latestDependencies(project: Project): Array<Dependency> {
    return PROJECT_VERSIONS[project.id]?.[0]?.dependencies ?? [];
  }
}

export const projectService = new Service();
