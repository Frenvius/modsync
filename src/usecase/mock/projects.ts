import type { Project, Dependency, ProjectVersion } from '~/domain/interfaces/project.interface';

import { GameId, LoaderId, ProviderId, ProjectType, DependencyType } from '~/domain/enums/provider.enum';

interface ProjectSeed {
  id: string;
  name: string;
  author: string;
  gameId: GameId;
  summary: string;
  version: string;
  provider: ProviderId;
  downloads: number;
  updatedAt: string;
  type?: ProjectType;
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
  [ProviderId.CurseForge]: 'https://www.curseforge.com/minecraft/mc-mods/',
  [ProviderId.Thunderstore]: 'https://thunderstore.io/c/',
  [ProviderId.VintageStoryDb]: 'https://mods.vintagestory.at/'
};

const req = (projectId: string, name: string, versionRange = '*'): Dependency => ({
  name,
  projectId,
  versionRange,
  type: DependencyType.Required
});

const opt = (projectId: string, name: string): Dependency => ({ name, projectId, type: DependencyType.Optional, versionRange: '*' });

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
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'Essential hooks and interoperability mechanisms for Fabric mods.',
    categories: ['Library', 'Utility'],
    loaders: MC_FABRIC,
    gameVersions: MC_RECENT,
    downloads: 142_530_812,
    updatedAt: '2026-09-02T14:10:00Z',
    version: '0.115.2+1.21.4'
  },
  {
    id: 'sodium',
    name: 'Sodium',
    author: 'jellysquid3',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'The fastest and most compatible rendering optimization mod for Minecraft.',
    categories: ['Optimization'],
    loaders: [LoaderId.Fabric, LoaderId.NeoForge],
    gameVersions: MC_RECENT,
    downloads: 58_204_119,
    updatedAt: '2026-08-28T09:00:00Z',
    version: '0.6.9'
  },
  {
    id: 'lithium',
    name: 'Lithium',
    author: 'jellysquid3',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'No-compromises game logic and server optimization mod.',
    categories: ['Optimization'],
    loaders: MC_FABRIC,
    gameVersions: MC_RECENT,
    downloads: 31_009_442,
    updatedAt: '2026-08-30T11:30:00Z',
    version: '0.14.7'
  },
  {
    id: 'iris',
    name: 'Iris Shaders',
    author: 'coderbot',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'A modern shader pack loader for Minecraft, compatible with Sodium.',
    categories: ['Decoration', 'Optimization'],
    loaders: [LoaderId.Fabric, LoaderId.NeoForge],
    gameVersions: MC_RECENT,
    downloads: 27_552_301,
    updatedAt: '2026-08-25T18:00:00Z',
    version: '1.8.8',
    dependencies: [req('sodium', 'Sodium', '>=0.6.0')]
  },
  {
    id: 'create',
    name: 'Create',
    author: 'simibubi',
    gameId: GameId.Minecraft,
    provider: ProviderId.CurseForge,
    summary: 'Aesthetic technology that empowers the player. Kinetic mechanisms, trains and contraptions.',
    categories: ['Technology', 'Decoration', 'Adventure'],
    loaders: [LoaderId.Forge, LoaderId.NeoForge],
    gameVersions: ['1.20.1', '1.19.2', '1.18.2'],
    downloads: 61_889_014,
    updatedAt: '2026-07-12T12:00:00Z',
    version: '0.5.1.j'
  },
  {
    id: 'create-fabric',
    name: 'Create Fabric',
    author: 'Fabricators of Create',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'The Fabric port of Create. Kinetic mechanisms, trains and contraptions for Fabric.',
    categories: ['Technology', 'Decoration'],
    loaders: MC_FABRIC,
    gameVersions: ['1.20.1', '1.19.2', '1.18.2'],
    downloads: 8_204_110,
    updatedAt: '2026-06-02T10:00:00Z',
    version: '0.5.1-f-build.1417',
    dependencies: [req('fabric-api', 'Fabric API'), incompatible('create', 'Create')]
  },
  {
    id: 'jei',
    name: 'Just Enough Items',
    author: 'mezz',
    gameId: GameId.Minecraft,
    provider: ProviderId.CurseForge,
    summary: 'View items and recipes. The classic recipe viewer.',
    categories: ['Utility', 'Library'],
    loaders: MC_ALL,
    gameVersions: MC_RECENT,
    downloads: 320_113_204,
    updatedAt: '2026-08-20T08:00:00Z',
    version: '19.21.0.247'
  },
  {
    id: 'rei',
    name: 'Roughly Enough Items',
    author: 'shedaniel',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'Clean and customizable recipe viewer.',
    categories: ['Utility'],
    loaders: MC_ALL,
    gameVersions: MC_RECENT,
    downloads: 22_004_991,
    updatedAt: '2026-09-01T17:45:00Z',
    version: '18.0.796',
    dependencies: [req('cloth-config', 'Cloth Config API'), req('architectury', 'Architectury API'), incompatible('jei', 'Just Enough Items')]
  },
  {
    id: 'cloth-config',
    name: 'Cloth Config API',
    author: 'shedaniel',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'Configuration library for Minecraft mods.',
    categories: ['Library'],
    loaders: MC_ALL,
    gameVersions: MC_RECENT,
    downloads: 45_772_000,
    updatedAt: '2026-08-15T10:00:00Z',
    version: '17.0.144'
  },
  {
    id: 'architectury',
    name: 'Architectury API',
    author: 'shedaniel',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'Intermediary API to ease developing multiplatform mods.',
    categories: ['Library'],
    loaders: MC_ALL,
    gameVersions: MC_RECENT,
    downloads: 40_010_223,
    updatedAt: '2026-08-11T10:00:00Z',
    version: '15.0.3'
  },
  {
    id: 'mod-menu',
    name: 'Mod Menu',
    author: 'Prospector',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    summary: 'Adds a mod menu to view the list of mods you have installed.',
    categories: ['Utility'],
    loaders: MC_FABRIC,
    gameVersions: MC_RECENT,
    downloads: 33_118_045,
    updatedAt: '2026-08-29T09:10:00Z',
    version: '13.0.3',
    dependencies: [req('fabric-api', 'Fabric API')]
  },
  {
    id: 'xaeros-minimap',
    name: "Xaero's Minimap",
    author: 'xaero96',
    gameId: GameId.Minecraft,
    provider: ProviderId.CurseForge,
    summary: 'A minimap that keeps the aesthetic of vanilla Minecraft.',
    categories: ['Utility', 'Adventure'],
    loaders: MC_ALL,
    gameVersions: MC_RECENT,
    downloads: 110_400_000,
    updatedAt: '2026-09-03T06:00:00Z',
    version: '25.2.10'
  },
  {
    id: 'complementary-reimagined',
    name: 'Complementary Shaders - Reimagined',
    author: 'EminGT',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    type: ProjectType.ShaderPack,
    summary: 'Preserving the vanilla look while adding beautiful lighting and shadows.',
    categories: ['Vanilla-like', 'Atmosphere'],
    loaders: [],
    gameVersions: MC_RECENT,
    downloads: 9_887_211,
    updatedAt: '2026-08-05T10:00:00Z',
    version: 'r5.5.1',
    dependencies: [req('iris', 'Iris Shaders')]
  },
  {
    id: 'faithful-32',
    name: 'Faithful 32x',
    author: 'Faithful Team',
    gameId: GameId.Minecraft,
    provider: ProviderId.CurseForge,
    type: ProjectType.ResourcePack,
    summary: 'The most popular high-resolution vanilla-faithful resource pack.',
    categories: ['Vanilla-like', '32x'],
    loaders: [],
    gameVersions: MC_RECENT,
    downloads: 12_004_000,
    updatedAt: '2026-08-19T10:00:00Z',
    version: '1.21.4'
  },
  {
    id: 'terralith',
    name: 'Terralith',
    author: 'Starmute',
    gameId: GameId.Minecraft,
    provider: ProviderId.Modrinth,
    type: ProjectType.DataPack,
    summary: 'Explore over 95 new biomes with a massive overhaul to world generation.',
    categories: ['Worldgen', 'Adventure'],
    loaders: [],
    gameVersions: MC_RECENT,
    downloads: 7_120_000,
    updatedAt: '2026-07-30T10:00:00Z',
    version: '2.5.8'
  },
  {
    id: 'bepinex-pack-valheim',
    name: 'BepInExPack Valheim',
    author: 'denikson',
    gameId: GameId.Valheim,
    provider: ProviderId.Thunderstore,
    summary: 'Unified BepInEx modding framework pack for Valheim.',
    categories: ['Libraries', 'Modpacks'],
    gameVersions: ['0.219.16', '0.219.13', '0.218.21'],
    downloads: 28_770_000,
    updatedAt: '2026-08-01T10:00:00Z',
    version: '5.4.2202'
  },
  {
    id: 'jotunn',
    name: 'Jotunn',
    author: 'ValheimModding',
    gameId: GameId.Valheim,
    provider: ProviderId.Thunderstore,
    summary: 'The Valheim Library. A framework for developing Valheim mods.',
    categories: ['Libraries'],
    gameVersions: ['0.219.16', '0.219.13'],
    downloads: 19_120_000,
    updatedAt: '2026-08-22T10:00:00Z',
    version: '2.24.3',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim', '>=5.4.2100')]
  },
  {
    id: 'valheim-plus',
    name: 'ValheimPlus',
    author: 'Grantapher',
    gameId: GameId.Valheim,
    provider: ProviderId.Thunderstore,
    summary: 'Highly configurable quality-of-life and balance improvements.',
    categories: ['Tweaks', 'Gameplay'],
    gameVersions: ['0.219.16', '0.219.13'],
    downloads: 6_320_000,
    updatedAt: '2026-08-27T10:00:00Z',
    version: '0.9.16.2',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim')]
  },
  {
    id: 'epic-loot',
    name: 'EpicLoot',
    author: 'RandyKnapp',
    gameId: GameId.Valheim,
    provider: ProviderId.Thunderstore,
    summary: 'Adds loot drops, magic items and enchanting to Valheim.',
    categories: ['Gameplay', 'Items'],
    gameVersions: ['0.219.16'],
    downloads: 4_100_000,
    updatedAt: '2026-08-30T10:00:00Z',
    version: '0.10.6',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim'), req('jotunn', 'Jotunn', '>=2.24.0')]
  },
  {
    id: 'plant-everything',
    name: 'PlantEverything',
    author: 'Advize',
    gameId: GameId.Valheim,
    provider: ProviderId.Thunderstore,
    summary: 'Allows you to plant and cultivate many more things.',
    categories: ['Building', 'Gameplay'],
    gameVersions: ['0.219.16', '0.219.13'],
    downloads: 2_900_000,
    updatedAt: '2026-07-14T10:00:00Z',
    version: '1.18.2',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim')]
  },
  {
    id: 'better-archery',
    name: 'BetterArchery',
    author: 'ishid4',
    gameId: GameId.Valheim,
    provider: ProviderId.Thunderstore,
    summary: 'Improves archery: quivers, arrow retrieval, better bow physics.',
    categories: ['Gameplay'],
    gameVersions: ['0.218.21'],
    downloads: 1_400_000,
    updatedAt: '2026-03-01T10:00:00Z',
    version: '1.9.6',
    dependencies: [req('bepinex-pack-valheim', 'BepInExPack Valheim')]
  },
  {
    id: 'r2-bepinex',
    name: 'BepInExPack',
    author: 'bbepis',
    gameId: GameId.RiskOfRain2,
    provider: ProviderId.Thunderstore,
    summary: 'BepInEx framework pack for Risk of Rain 2.',
    categories: ['Libraries'],
    gameVersions: ['1.3.9', '1.3.6'],
    downloads: 32_000_000,
    updatedAt: '2026-06-10T10:00:00Z',
    version: '5.4.2113'
  },
  {
    id: 'r2api',
    name: 'R2API',
    author: 'tristanmcpherson',
    gameId: GameId.RiskOfRain2,
    provider: ProviderId.Thunderstore,
    summary: 'A modding API for Risk of Rain 2.',
    categories: ['Libraries'],
    gameVersions: ['1.3.9', '1.3.6'],
    downloads: 25_500_000,
    updatedAt: '2026-08-02T10:00:00Z',
    version: '5.1.5',
    dependencies: [req('r2-bepinex', 'BepInExPack')]
  },
  {
    id: 'ror2-shared-suffering',
    name: 'ShareSuffering',
    author: 'FunkFrog',
    gameId: GameId.RiskOfRain2,
    provider: ProviderId.Thunderstore,
    summary: 'Item sharing between players for co-op runs.',
    categories: ['Multiplayer', 'Items'],
    gameVersions: ['1.3.9'],
    downloads: 3_800_000,
    updatedAt: '2026-08-14T10:00:00Z',
    version: '2.11.1',
    dependencies: [req('r2-bepinex', 'BepInExPack'), req('r2api', 'R2API')]
  },
  {
    id: 'lc-bepinex',
    name: 'BepInExPack',
    author: 'BepInEx',
    gameId: GameId.LethalCompany,
    provider: ProviderId.Thunderstore,
    summary: 'BepInEx framework pack for Lethal Company.',
    categories: ['Libraries'],
    gameVersions: ['v69', 'v64'],
    downloads: 41_000_000,
    updatedAt: '2026-05-10T10:00:00Z',
    version: '5.4.2100'
  },
  {
    id: 'more-company',
    name: 'MoreCompany',
    author: 'notnotnotswipez',
    gameId: GameId.LethalCompany,
    provider: ProviderId.Thunderstore,
    summary: 'Increases the max player count and adds cosmetics.',
    categories: ['Multiplayer', 'Cosmetics'],
    gameVersions: ['v69', 'v64'],
    downloads: 33_000_000,
    updatedAt: '2026-08-21T10:00:00Z',
    version: '1.11.0',
    dependencies: [req('lc-bepinex', 'BepInExPack')]
  },
  {
    id: 'vs-carry-on',
    name: 'Carry On',
    author: 'copygirl',
    gameId: GameId.VintageStory,
    provider: ProviderId.VintageStoryDb,
    summary: 'Carry chests, barrels and other blocks on your back.',
    categories: ['Gameplay', 'QoL'],
    gameVersions: ['1.20.4', '1.20.1', '1.19.8'],
    downloads: 640_000,
    updatedAt: '2026-08-18T10:00:00Z',
    version: '1.8.0'
  },
  {
    id: 'vs-primitive-survival',
    name: 'Primitive Survival',
    author: 'Spear and Fang',
    gameId: GameId.VintageStory,
    provider: ProviderId.VintageStoryDb,
    summary: 'Fishing, traps, snares and primitive tools for early survival.',
    categories: ['Gameplay', 'Survival'],
    gameVersions: ['1.20.4', '1.20.1'],
    downloads: 420_000,
    updatedAt: '2026-08-28T10:00:00Z',
    version: '3.7.4'
  },
  {
    id: 'vs-expanded-foods',
    name: 'Expanded Foods',
    author: 'l33tmaan',
    gameId: GameId.VintageStory,
    provider: ProviderId.VintageStoryDb,
    summary: 'Hundreds of new recipes, food types and cooking mechanics.',
    categories: ['Food', 'Gameplay'],
    gameVersions: ['1.20.1', '1.19.8'],
    downloads: 380_000,
    updatedAt: '2026-06-05T10:00:00Z',
    version: '1.7.5'
  },
  {
    id: 'vs-xskills',
    name: 'XSkills',
    author: 'Xandu',
    gameId: GameId.VintageStory,
    provider: ProviderId.VintageStoryDb,
    summary: 'Skill and level system with unlockable abilities.',
    categories: ['Gameplay', 'Progression'],
    gameVersions: ['1.20.4', '1.20.1'],
    downloads: 290_000,
    updatedAt: '2026-09-01T10:00:00Z',
    version: '0.8.6',
    dependencies: [req('vs-xlib', 'XLib')]
  },
  {
    id: 'vs-xlib',
    name: 'XLib',
    author: 'Xandu',
    gameId: GameId.VintageStory,
    provider: ProviderId.VintageStoryDb,
    summary: 'Shared library for XSkills and related mods.',
    categories: ['Library'],
    gameVersions: ['1.20.4', '1.20.1'],
    downloads: 300_000,
    updatedAt: '2026-09-01T09:00:00Z',
    version: '0.8.6'
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
    id: `${seed.id}@${i}`,
    projectId: seed.id,
    number: bumpVersion(seed.version, i),
    name: `${seed.name} ${bumpVersion(seed.version, i)}`,
    changelog: notes[i],
    fileSize: 420_000 + ((seed.id.length * 7919) % 3_000_000),
    downloads: Math.round(seed.downloads / (3 + i * 4)),
    publishedAt: daysAgo(seed.updatedAt, i * 23),
    loaders: seed.loaders ?? [LoaderId.BepInEx],
    gameVersions: i === 0 ? seed.gameVersions : seed.gameVersions.slice(i),
    dependencies: seed.dependencies ?? []
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
  description: LONG_DESCRIPTION,
  type: seed.type ?? ProjectType.Mod,
  iconColor: colorFor(seed.id),
  updatedAt: seed.updatedAt,
  downloads: seed.downloads,
  followers: Math.round(seed.downloads / 180),
  categories: seed.categories,
  gallery: [colorFor(`${seed.id}-1`), colorFor(`${seed.id}-2`), colorFor(`${seed.id}-3`)],
  loaders: seed.loaders ?? [LoaderId.BepInEx],
  gameVersions: seed.gameVersions,
  latestVersion: seed.version,
  provider: { id: seed.provider, externalId: `${seed.provider.slice(0, 2)}-${seed.id}`, url: `${PROVIDER_URLS[seed.provider]}${seed.id}` }
}));

export const PROJECT_VERSIONS: Record<string, Array<ProjectVersion>> = Object.fromEntries(
  SEEDS.map((seed) => [seed.id, buildVersions(seed)])
);

export const CATEGORIES_BY_GAME: Record<GameId, Array<string>> = {
  [GameId.Minecraft]: ['Adventure', 'Decoration', 'Library', 'Optimization', 'Technology', 'Utility', 'Worldgen'],
  [GameId.Valheim]: ['Building', 'Gameplay', 'Items', 'Libraries', 'Tweaks'],
  [GameId.RiskOfRain2]: ['Items', 'Libraries', 'Multiplayer', 'Survivors'],
  [GameId.LethalCompany]: ['Cosmetics', 'Libraries', 'Multiplayer', 'Monsters'],
  [GameId.VintageStory]: ['Food', 'Gameplay', 'Library', 'Progression', 'QoL', 'Survival']
};

export { colorFor, opt };
