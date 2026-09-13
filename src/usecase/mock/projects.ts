import type { Project, Dependency, ProjectVersion } from '~/domain/interfaces/project.interface';

import { GameId, LoaderId, ProviderId, ProjectType, DependencyType } from '~/domain/enums/provider.enum';

interface ProjectSeed {
  id: string;
  name: string;
  author: string;
  gameId: GameId;
  summary: string;
  version: string;
  downloads: number;
  updatedAt: string;
  type?: ProjectType;
  provider: ProviderId;
  categories: Array<string>;
  loaders?: Array<LoaderId>;
  gameVersions: Array<string>;
  dependencies?: Array<Dependency>;
}

const PALETTE = ['#4fa3ff', '#f16436', '#1bd96a', '#d0a45a', '#b56cf5', '#ff6b9c', '#39c5bb', '#e8c547', '#ff8c42', '#7a9cc6'];

const colorFor = (id: string) => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};

const PROVIDER_URLS: Record<ProviderId, string> = {
  [ProviderId.Modrinth]: 'https://modrinth.com/mod/',
  [ProviderId.Thunderstore]: 'https://thunderstore.io/c/',
  [ProviderId.VintageStoryDb]: 'https://mods.vintagestory.at/',
  [ProviderId.CurseForge]: 'https://www.curseforge.com/minecraft/mc-mods/'
};

const req = (projectId: string, name: string, versionRange = '*'): Dependency => ({
  name,
  projectId,
  versionRange,
  type: DependencyType.Required
});

const opt = (projectId: string, name: string): Dependency => ({
  name,
  projectId,
  versionRange: '*',
  type: DependencyType.Optional
});

const incompatible = (projectId: string, name: string): Dependency => ({
  name,
  projectId,
  versionRange: '*',
  type: DependencyType.Incompatible
});

const MC_FABRIC = [LoaderId.Fabric, LoaderId.Quilt];
const MC_ALL = [LoaderId.Fabric, LoaderId.Forge, LoaderId.NeoForge, LoaderId.Quilt];
const MC_RECENT = ['1.21.4', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1'];

const SEEDS: Array<ProjectSeed> = [
  {
    id: 'fabric-api',
    name: 'Fabric API',
    author: 'FabricMC',
    loaders: MC_FABRIC,
    downloads: 142_530_812,
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    version: '0.115.2+1.21.4',
    provider: ProviderId.Modrinth,
    updatedAt: '2026-09-02T14:10:00Z',
    categories: ['Library', 'Utility'],
    summary: 'Essential hooks and interoperability mechanisms for Fabric mods.'
  },
  {
    id: 'sodium',
    name: 'Sodium',
    version: '0.6.9',
    author: 'jellysquid3',
    downloads: 58_204_119,
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    categories: ['Optimization'],
    provider: ProviderId.Modrinth,
    updatedAt: '2026-08-28T09:00:00Z',
    loaders: [LoaderId.Fabric, LoaderId.NeoForge],
    summary: 'The fastest and most compatible rendering optimization mod for Minecraft.'
  },
  {
    id: 'lithium',
    name: 'Lithium',
    version: '0.14.7',
    loaders: MC_FABRIC,
    author: 'jellysquid3',
    downloads: 31_009_442,
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    categories: ['Optimization'],
    provider: ProviderId.Modrinth,
    updatedAt: '2026-08-30T11:30:00Z',
    summary: 'No-compromises game logic and server optimization mod.'
  },
  {
    id: 'iris',
    version: '1.8.8',
    author: 'coderbot',
    name: 'Iris Shaders',
    downloads: 27_552_301,
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    updatedAt: '2026-08-25T18:00:00Z',
    categories: ['Decoration', 'Optimization'],
    loaders: [LoaderId.Fabric, LoaderId.NeoForge],
    dependencies: [req('sodium', 'Sodium', '>=0.6.0')],
    summary: 'A modern shader pack loader for Minecraft, compatible with Sodium.'
  },
  {
    id: 'create',
    name: 'Create',
    author: 'simibubi',
    version: '0.5.1.j',
    downloads: 61_889_014,
    gameId: GameId.Minecraft,
    provider: ProviderId.CurseForge,
    updatedAt: '2026-07-12T12:00:00Z',
    loaders: [LoaderId.Forge, LoaderId.NeoForge],
    gameVersions: ['1.20.1', '1.19.2', '1.18.2'],
    categories: ['Technology', 'Decoration', 'Adventure'],
    summary: 'Aesthetic technology that empowers the player. Kinetic mechanisms, trains and contraptions.'
  },
  {
    loaders: MC_FABRIC,
    id: 'create-fabric',
    downloads: 8_204_110,
    name: 'Create Fabric',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    version: '0.5.1-f-build.1417',
    author: 'Fabricators of Create',
    updatedAt: '2026-06-02T10:00:00Z',
    categories: ['Technology', 'Decoration'],
    gameVersions: ['1.20.1', '1.19.2', '1.18.2'],
    dependencies: [req('fabric-api', 'Fabric API'), incompatible('create', 'Create')],
    summary: 'The Fabric port of Create. Kinetic mechanisms, trains and contraptions for Fabric.'
  },
  {
    id: 'jei',
    author: 'mezz',
    loaders: MC_ALL,
    downloads: 320_113_204,
    version: '19.21.0.247',
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    name: 'Just Enough Items',
    provider: ProviderId.CurseForge,
    updatedAt: '2026-08-20T08:00:00Z',
    categories: ['Utility', 'Library'],
    summary: 'View items and recipes. The classic recipe viewer.'
  },
  {
    id: 'rei',
    loaders: MC_ALL,
    author: 'shedaniel',
    version: '18.0.796',
    downloads: 22_004_991,
    categories: ['Utility'],
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    name: 'Roughly Enough Items',
    provider: ProviderId.Modrinth,
    updatedAt: '2026-09-01T17:45:00Z',
    summary: 'Clean and customizable recipe viewer.',
    dependencies: [
      req('cloth-config', 'Cloth Config API'),
      req('architectury', 'Architectury API'),
      incompatible('jei', 'Just Enough Items')
    ]
  },
  {
    loaders: MC_ALL,
    id: 'cloth-config',
    author: 'shedaniel',
    version: '17.0.144',
    downloads: 45_772_000,
    categories: ['Library'],
    gameVersions: MC_RECENT,
    name: 'Cloth Config API',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    updatedAt: '2026-08-15T10:00:00Z',
    summary: 'Configuration library for Minecraft mods.'
  },
  {
    loaders: MC_ALL,
    version: '15.0.3',
    id: 'architectury',
    author: 'shedaniel',
    downloads: 40_010_223,
    categories: ['Library'],
    gameVersions: MC_RECENT,
    name: 'Architectury API',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    updatedAt: '2026-08-11T10:00:00Z',
    summary: 'Intermediary API to ease developing multiplatform mods.'
  },
  {
    id: 'mod-menu',
    name: 'Mod Menu',
    version: '13.0.3',
    loaders: MC_FABRIC,
    author: 'Prospector',
    downloads: 33_118_045,
    categories: ['Utility'],
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    updatedAt: '2026-08-29T09:10:00Z',
    dependencies: [req('fabric-api', 'Fabric API')],
    summary: 'Adds a mod menu to view the list of mods you have installed.'
  },
  {
    loaders: MC_ALL,
    author: 'xaero96',
    version: '25.2.10',
    id: 'xaeros-minimap',
    downloads: 110_400_000,
    name: "Xaero's Minimap",
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    provider: ProviderId.CurseForge,
    updatedAt: '2026-09-03T06:00:00Z',
    categories: ['Utility', 'Adventure'],
    summary: 'A minimap that keeps the aesthetic of vanilla Minecraft.'
  },
  {
    loaders: [],
    author: 'EminGT',
    version: 'r5.5.1',
    downloads: 9_887_211,
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    type: ProjectType.ShaderPack,
    provider: ProviderId.Modrinth,
    id: 'complementary-reimagined',
    updatedAt: '2026-08-05T10:00:00Z',
    name: 'Complementary Shaders - Reimagined',
    categories: ['Vanilla-like', 'Atmosphere'],
    dependencies: [req('iris', 'Iris Shaders')],
    summary: 'Preserving the vanilla look while adding beautiful lighting and shadows.'
  },
  {
    loaders: [],
    id: 'faithful-32',
    version: '1.21.4',
    name: 'Faithful 32x',
    downloads: 12_004_000,
    author: 'Faithful Team',
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    type: ProjectType.ResourcePack,
    provider: ProviderId.CurseForge,
    updatedAt: '2026-08-19T10:00:00Z',
    categories: ['Vanilla-like', '32x'],
    summary: 'The most popular high-resolution vanilla-faithful resource pack.'
  },
  {
    loaders: [],
    id: 'terralith',
    version: '2.5.8',
    name: 'Terralith',
    author: 'Starmute',
    downloads: 7_120_000,
    gameVersions: MC_RECENT,
    gameId: GameId.Minecraft,
    type: ProjectType.DataPack,
    provider: ProviderId.Modrinth,
    updatedAt: '2026-07-30T10:00:00Z',
    categories: ['Worldgen', 'Adventure'],
    summary: 'Explore over 95 new biomes with a massive overhaul to world generation.'
  },
  {
    author: 'denikson',
    version: '5.4.2202',
    downloads: 28_770_000,
    gameId: GameId.Valheim,
    categories: ['Libraries'],
    id: 'bepinex-pack-valheim',
    name: 'BepInExPack Valheim',
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-08-01T10:00:00Z',
    gameVersions: ['0.219.16', '0.219.13', '0.218.21'],
    summary: 'Unified BepInEx modding framework pack for Valheim.'
  },
  {
    id: 'jotunn',
    name: 'Jotunn',
    version: '2.24.3',
    downloads: 19_120_000,
    gameId: GameId.Valheim,
    author: 'ValheimModding',
    categories: ['Libraries'],
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-08-22T10:00:00Z',
    gameVersions: ['0.219.16', '0.219.13'],
    summary: 'The Valheim Library. A framework for developing Valheim mods.',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim', '>=5.4.2100')]
  },
  {
    id: 'valheim-plus',
    name: 'ValheimPlus',
    version: '0.9.16.2',
    author: 'Grantapher',
    downloads: 6_320_000,
    gameId: GameId.Valheim,
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-08-27T10:00:00Z',
    categories: ['Tweaks', 'Gameplay'],
    gameVersions: ['0.219.16', '0.219.13'],
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim')],
    summary: 'Highly configurable quality-of-life and balance improvements.'
  },
  {
    id: 'epic-loot',
    name: 'EpicLoot',
    version: '0.10.6',
    author: 'RandyKnapp',
    downloads: 4_100_000,
    gameId: GameId.Valheim,
    gameVersions: ['0.219.16'],
    provider: ProviderId.Thunderstore,
    categories: ['Gameplay', 'Items'],
    updatedAt: '2026-08-30T10:00:00Z',
    summary: 'Adds loot drops, magic items and enchanting to Valheim.',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim'), req('jotunn', 'Jotunn', '>=2.24.0')]
  },
  {
    author: 'Advize',
    version: '1.18.2',
    downloads: 2_900_000,
    id: 'plant-everything',
    gameId: GameId.Valheim,
    name: 'PlantEverything',
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-07-14T10:00:00Z',
    categories: ['Building', 'Gameplay'],
    gameVersions: ['0.219.16', '0.219.13'],
    summary: 'Allows you to plant and cultivate many more things.',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim')]
  },
  {
    author: 'ishid4',
    version: '1.9.6',
    id: 'better-archery',
    downloads: 1_400_000,
    name: 'BetterArchery',
    gameId: GameId.Valheim,
    categories: ['Gameplay'],
    gameVersions: ['0.218.21'],
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-03-01T10:00:00Z',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim')],
    summary: 'Improves archery: quivers, arrow retrieval, better bow physics.'
  },
  {
    id: 'r2-bepinex',
    author: 'bbepis',
    name: 'BepInExPack',
    version: '5.4.2113',
    downloads: 32_000_000,
    categories: ['Libraries'],
    gameId: GameId.RiskOfRain2,
    gameVersions: ['1.3.9', '1.3.6'],
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-06-10T10:00:00Z',
    summary: 'BepInEx framework pack for Risk of Rain 2.'
  },
  {
    id: 'r2api',
    name: 'R2API',
    version: '5.1.5',
    downloads: 25_500_000,
    categories: ['Libraries'],
    author: 'tristanmcpherson',
    gameId: GameId.RiskOfRain2,
    gameVersions: ['1.3.9', '1.3.6'],
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-08-02T10:00:00Z',
    summary: 'A modding API for Risk of Rain 2.',
    dependencies: [req('r2-bepinex', 'BepInExPack')]
  },
  {
    version: '2.11.1',
    author: 'FunkFrog',
    downloads: 3_800_000,
    name: 'ShareSuffering',
    gameVersions: ['1.3.9'],
    gameId: GameId.RiskOfRain2,
    id: 'ror2-shared-suffering',
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-08-14T10:00:00Z',
    categories: ['Multiplayer', 'Items'],
    summary: 'Item sharing between players for co-op runs.',
    dependencies: [req('r2-bepinex', 'BepInExPack'), req('r2api', 'R2API')]
  },
  {
    id: 'lc-bepinex',
    author: 'BepInEx',
    name: 'BepInExPack',
    version: '5.4.2100',
    downloads: 41_000_000,
    categories: ['Libraries'],
    gameId: GameId.LethalCompany,
    gameVersions: ['v69', 'v64'],
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-05-10T10:00:00Z',
    summary: 'BepInEx framework pack for Lethal Company.'
  },
  {
    version: '1.11.0',
    id: 'more-company',
    name: 'MoreCompany',
    downloads: 33_000_000,
    author: 'notnotnotswipez',
    gameId: GameId.LethalCompany,
    gameVersions: ['v69', 'v64'],
    provider: ProviderId.Thunderstore,
    updatedAt: '2026-08-21T10:00:00Z',
    categories: ['Multiplayer', 'Cosmetics'],
    dependencies: [req('lc-bepinex', 'BepInExPack')],
    summary: 'Increases the max player count and adds cosmetics.'
  },
  {
    name: 'Carry On',
    version: '1.8.0',
    id: 'vs-carry-on',
    author: 'copygirl',
    downloads: 640_000,
    gameId: GameId.VintageStory,
    categories: ['Gameplay', 'QoL'],
    updatedAt: '2026-08-18T10:00:00Z',
    provider: ProviderId.VintageStoryDb,
    gameVersions: ['1.20.4', '1.20.1', '1.19.8'],
    summary: 'Carry chests, barrels and other blocks on your back.'
  },
  {
    version: '3.7.4',
    downloads: 420_000,
    author: 'Spear and Fang',
    name: 'Primitive Survival',
    id: 'vs-primitive-survival',
    gameId: GameId.VintageStory,
    updatedAt: '2026-08-28T10:00:00Z',
    gameVersions: ['1.20.4', '1.20.1'],
    provider: ProviderId.VintageStoryDb,
    categories: ['Gameplay', 'Survival'],
    summary: 'Fishing, traps, snares and primitive tools for early survival.'
  },
  {
    version: '1.7.5',
    author: 'l33tmaan',
    downloads: 380_000,
    name: 'Expanded Foods',
    id: 'vs-expanded-foods',
    gameId: GameId.VintageStory,
    categories: ['Food', 'Gameplay'],
    updatedAt: '2026-06-05T10:00:00Z',
    gameVersions: ['1.20.1', '1.19.8'],
    provider: ProviderId.VintageStoryDb,
    summary: 'Hundreds of new recipes, food types and cooking mechanics.'
  },
  {
    name: 'XSkills',
    author: 'Xandu',
    id: 'vs-xskills',
    version: '0.8.6',
    downloads: 290_000,
    gameId: GameId.VintageStory,
    updatedAt: '2026-09-01T10:00:00Z',
    gameVersions: ['1.20.4', '1.20.1'],
    provider: ProviderId.VintageStoryDb,
    dependencies: [req('vs-xlib', 'XLib')],
    categories: ['Gameplay', 'Progression'],
    summary: 'Skill and level system with unlockable abilities.'
  },
  {
    name: 'XLib',
    id: 'vs-xlib',
    author: 'Xandu',
    version: '0.8.6',
    downloads: 300_000,
    categories: ['Library'],
    gameId: GameId.VintageStory,
    updatedAt: '2026-09-01T09:00:00Z',
    gameVersions: ['1.20.4', '1.20.1'],
    provider: ProviderId.VintageStoryDb,
    summary: 'Shared library for XSkills and related mods.'
  }
];

const bumpVersion = (version: string, steps: number) => {
  const parts = version.split('.');
  const last = parts.length - 1;
  const n = parseInt(parts[last], 10);
  if (Number.isNaN(n)) return `${version}-b${steps}`;
  parts[last] = String(Math.max(0, n - steps));
  return parts.join('.');
};

const daysAgo = (iso: string, days: number) => new Date(new Date(iso).getTime() - days * 86_400_000).toISOString();

const buildVersions = (seed: ProjectSeed): Array<ProjectVersion> => {
  const notes = [
    'Fixed a crash when loading worlds created on older versions.\nImproved compatibility with the latest game update.',
    'Performance improvements and minor bug fixes.',
    'Added new configuration options.\nUpdated translations.'
  ];
  return [0, 1, 2].map((i) => ({
    projectId: seed.id,
    changelog: notes[i],
    id: `${seed.id}@${i}`,
    number: bumpVersion(seed.version, i),
    dependencies: seed.dependencies ?? [],
    loaders: seed.loaders ?? [LoaderId.BepInEx],
    publishedAt: daysAgo(seed.updatedAt, i * 23),
    downloads: Math.round(seed.downloads / (3 + i * 4)),
    name: `${seed.name} ${bumpVersion(seed.version, i)}`,
    fileSize: 420_000 + ((seed.id.length * 7919) % 3_000_000),
    gameVersions: i === 0 ? seed.gameVersions : seed.gameVersions.slice(i)
  }));
};

const LONG_DESCRIPTION = `## About

This project is built to slot into any modded setup without surprises. It follows the game's own conventions, keeps configuration minimal and ships sane defaults.

## Features

- Drop-in installation, no manual file edits
- Fully configurable through the generated config file
- Multiplayer safe: works on dedicated servers and in single player
- Actively maintained for the latest game versions

## Compatibility

Works alongside most popular mods. Conflicts are listed in the dependency section and are checked automatically before installation.`;

export const PROJECTS: Array<Project> = SEEDS.map((seed) => ({
  id: seed.id,
  slug: seed.id,
  name: seed.name,
  author: seed.author,
  gameId: seed.gameId,
  summary: seed.summary,
  updatedAt: seed.updatedAt,
  downloads: seed.downloads,
  categories: seed.categories,
  latestVersion: seed.version,
  iconColor: colorFor(seed.id),
  description: LONG_DESCRIPTION,
  gameVersions: seed.gameVersions,
  type: seed.type ?? ProjectType.Mod,
  followers: Math.round(seed.downloads / 180),
  loaders: seed.loaders ?? [LoaderId.BepInEx],
  gallery: [colorFor(`${seed.id}-1`), colorFor(`${seed.id}-2`), colorFor(`${seed.id}-3`)],
  provider: {
    id: seed.provider,
    url: `${PROVIDER_URLS[seed.provider]}${seed.id}`,
    externalId: `${seed.provider.slice(0, 2)}-${seed.id}`
  }
}));

export const PROJECT_VERSIONS: Record<string, Array<ProjectVersion>> = Object.fromEntries(
  SEEDS.map((seed) => [seed.id, buildVersions(seed)])
);

export const CATEGORIES_BY_GAME: Record<GameId, Array<string>> = {
  [GameId.RiskOfRain2]: ['Items', 'Libraries', 'Multiplayer', 'Survivors'],
  [GameId.Valheim]: ['Building', 'Gameplay', 'Items', 'Libraries', 'Tweaks'],
  [GameId.LethalCompany]: ['Cosmetics', 'Libraries', 'Multiplayer', 'Monsters'],
  [GameId.VintageStory]: ['Food', 'Gameplay', 'Library', 'Progression', 'QoL', 'Survival'],
  [GameId.Minecraft]: ['Adventure', 'Decoration', 'Library', 'Optimization', 'Technology', 'Utility', 'Worldgen']
};

export { opt, colorFor };
