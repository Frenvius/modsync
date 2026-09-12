import type { Game } from '~/domain/interfaces/game.interface';
import type { Instance } from '~/domain/interfaces/instance.interface';
import type { Project, Dependency, SearchQuery, SearchResult, ProjectVersion, CompatibilityIssue, CompatibilityReport } from '~/domain/interfaces/project.interface';

import { GAMES, LOADER_NAMES } from '~/usecase/mock/games';
import { LoaderId, DependencyType } from '~/domain/enums/provider.enum';
import { providerRegistry } from '~/usecase/service/providers';
import { PROJECTS, PROJECT_VERSIONS, CATEGORIES_BY_GAME } from '~/usecase/mock/projects';

export interface DependencyResolution {
  toInstall: Array<Dependency>;
  optional: Array<Dependency>;
  conflicts: Array<Dependency>;
  alreadyInstalled: Array<Dependency>;
}

class Service {
  getGame(gameId: Game['id']): Game {
    return GAMES.find((g) => g.id === gameId) ?? GAMES[0];
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
    return { total: items.length, items };
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
      issues.push({ kind: 'version', severity: 'error', message: `Made for ${this.getGame(project.gameId).name}, not ${this.getGame(instance.gameId).name}.` });
      return { compatible: false, issues };
    }
    if (project.loaders.length > 0 && instance.loader !== LoaderId.Vanilla && !project.loaders.includes(instance.loader)) {
      issues.push({
        kind: 'loader',
        severity: 'error',
        message: `Requires ${project.loaders.map((l) => LOADER_NAMES[l]).join(' or ')}. This instance uses ${LOADER_NAMES[instance.loader]}.`,
        remediation: 'Create a new instance with a supported loader'
      });
    }
    if (!project.gameVersions.includes(instance.gameVersion)) {
      issues.push({
        kind: 'version',
        severity: 'warning',
        message: `No release for ${instance.gameVersion}. Latest supports ${project.gameVersions[0]}.`,
        remediation: 'Install anyway at your own risk, or change the instance version'
      });
    }
    const conflicts = this.latestDependencies(project).filter(
      (d) => d.type === DependencyType.Incompatible && instance.mods.some((m) => m.projectId === d.projectId && m.enabled)
    );
    for (const c of conflicts) {
      issues.push({ kind: 'conflict', severity: 'error', message: `Conflicts with ${c.name}, which is installed.`, remediation: `Disable or remove ${c.name}` });
    }
    return { compatible: issues.every((i) => i.severity !== 'error'), issues };
  }

  resolveDependencies(project: Project, instance: Instance): DependencyResolution {
    const deps = this.latestDependencies(project);
    const installed = new Set(instance.mods.map((m) => m.projectId));
    return {
      toInstall: deps.filter((d) => d.type === DependencyType.Required && !installed.has(d.projectId)),
      optional: deps.filter((d) => d.type === DependencyType.Optional && !installed.has(d.projectId)),
      conflicts: deps.filter((d) => d.type === DependencyType.Incompatible && installed.has(d.projectId)),
      alreadyInstalled: deps.filter((d) => d.type === DependencyType.Required && installed.has(d.projectId))
    };
  }

  private latestDependencies(project: Project): Array<Dependency> {
    return PROJECT_VERSIONS[project.id]?.[0]?.dependencies ?? [];
  }
}

export const projectService = new Service();
