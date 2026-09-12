import type { Instance, InstalledMod } from '~/domain/interfaces/instance.interface';

import { colorFor } from '~/usecase/mock/projects';
import { GameId, LoaderId, ProviderId, ProjectType, UpdateStatus } from '~/domain/enums/provider.enum';

interface ModSeed {
  id: string;
  name: string;
  author: string;
  version: string;
  latest?: string;
  enabled?: boolean;
  type?: ProjectType;
  provider: ProviderId;
  status?: UpdateStatus;
  missingDependency?: string;
}

const mod = (seed: ModSeed): InstalledMod => ({
  name: seed.name,
  projectId: seed.id,
  author: seed.author,
  provider: seed.provider,
  iconColor: colorFor(seed.id),
  enabled: seed.enabled ?? true,
  installedVersion: seed.version,
  type: seed.type ?? ProjectType.Mod,
  missingDependency: seed.missingDependency,
  latestCompatibleVersion: seed.latest ?? seed.version,
  status: seed.status ?? (seed.latest && seed.latest !== seed.version ? UpdateStatus.UpdateAvailable : UpdateStatus.UpToDate)
});

const MR = ProviderId.Modrinth;
const CF = ProviderId.CurseForge;
const TS = ProviderId.Thunderstore;
const VS = ProviderId.VintageStoryDb;

const LOGS = [
  { level: 'info' as const, timestamp: '2026-09-05T20:41:02Z', message: 'Launcher started, loading instance profile' },
  { level: 'info' as const, timestamp: '2026-09-05T20:41:03Z', message: 'Resolving 12 mods from lockfile' },
  { level: 'debug' as const, timestamp: '2026-09-05T20:41:03Z', message: 'Cache hit for fabric-api 0.115.2' },
  { level: 'info' as const, timestamp: '2026-09-05T20:41:05Z', message: 'Java runtime detected: Temurin 21.0.4' },
  {
    level: 'warn' as const,
    timestamp: '2026-09-05T20:41:07Z',
    message: 'Mod "BetterArchery" targets an older game version, loading anyway'
  },
  { level: 'info' as const, timestamp: '2026-09-05T20:41:12Z', message: 'Game process started (pid 18422)' },
  {
    level: 'error' as const,
    timestamp: '2026-09-05T20:44:31Z',
    message: 'Mixin apply failed for optional injector in sodium-extras, skipped'
  },
  { level: 'info' as const, timestamp: '2026-09-05T21:02:10Z', message: 'Game process exited with code 0' }
];

export const INSTANCES: Array<Instance> = [
  {
    logs: LOGS,
    memoryMb: 4096,
    name: 'Vanilla+',
    icon: 'sparkles',
    iconColor: '#1bd96a',
    gameVersion: '1.21.4',
    playtimeMinutes: 6_240,
    id: 'inst-vanilla-plus',
    loader: LoaderId.Fabric,
    gameId: GameId.Minecraft,
    loaderVersion: '0.16.10',
    createdAt: '2026-05-12T10:00:00Z',
    updatedAt: '2026-09-04T18:12:00Z',
    lastPlayed: '2026-09-05T21:02:00Z',
    javaArgs: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50',
    description: 'Lightweight quality-of-life pack. Keeps the vanilla feel with performance and UI improvements.',
    configs: [
      { size: 1_204, format: 'json', path: 'config/sodium-options.json', modifiedAt: '2026-09-01T10:00:00Z' },
      { size: 512, format: 'properties', path: 'config/iris.properties', modifiedAt: '2026-08-30T10:00:00Z' },
      { size: 388, format: 'properties', path: 'config/lithium.properties', modifiedAt: '2026-08-12T10:00:00Z' },
      { size: 2_910, format: 'cfg', path: 'config/xaerominimap.txt', modifiedAt: '2026-09-04T10:00:00Z' },
      { size: 4_420, path: 'options.txt', format: 'properties', modifiedAt: '2026-09-05T10:00:00Z' }
    ],
    mods: [
      mod({
        provider: MR,
        id: 'fabric-api',
        name: 'Fabric API',
        author: 'FabricMC',
        latest: '0.115.2+1.21.4',
        version: '0.114.0+1.21.4'
      }),
      mod({ id: 'sodium', provider: MR, name: 'Sodium', version: '0.6.9', author: 'jellysquid3' }),
      mod({ provider: MR, id: 'lithium', name: 'Lithium', latest: '0.14.7', version: '0.14.5', author: 'jellysquid3' }),
      mod({ id: 'iris', provider: MR, latest: '1.8.8', version: '1.7.6', author: 'coderbot', name: 'Iris Shaders' }),
      mod({ provider: MR, id: 'mod-menu', name: 'Mod Menu', version: '13.0.3', author: 'Prospector' }),
      mod({ id: 'rei', provider: MR, author: 'shedaniel', version: '18.0.796', name: 'Roughly Enough Items' }),
      mod({ provider: MR, id: 'cloth-config', author: 'shedaniel', version: '17.0.144', name: 'Cloth Config API' }),
      mod({ provider: MR, version: '15.0.3', id: 'architectury', author: 'shedaniel', name: 'Architectury API' }),
      mod({
        provider: CF,
        author: 'xaero96',
        version: '25.2.8',
        latest: '25.2.10',
        id: 'xaeros-minimap',
        name: "Xaero's Minimap"
      }),
      mod({
        provider: MR,
        author: 'EminGT',
        version: 'r5.5.1',
        type: ProjectType.ShaderPack,
        id: 'complementary-reimagined',
        name: 'Complementary Shaders - Reimagined'
      }),
      mod({
        provider: CF,
        id: 'faithful-32',
        version: '1.21.4',
        name: 'Faithful 32x',
        author: 'Faithful Team',
        type: ProjectType.ResourcePack
      }),
      mod({
        provider: MR,
        enabled: false,
        id: 'terralith',
        version: '2.5.8',
        name: 'Terralith',
        author: 'Starmute',
        type: ProjectType.DataPack,
        status: UpdateStatus.Disabled
      })
    ]
  },
  {
    icon: 'cog',
    memoryMb: 8192,
    iconColor: '#f16436',
    gameVersion: '1.20.1',
    loader: LoaderId.Forge,
    logs: LOGS.slice(0, 6),
    name: 'Create Survival',
    playtimeMinutes: 11_820,
    gameId: GameId.Minecraft,
    loaderVersion: '47.3.12',
    id: 'inst-create-survival',
    createdAt: '2026-02-03T10:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    lastPlayed: '2026-09-03T19:30:00Z',
    modpack: { version: '1.4.0', modpackId: 'pack-create-survival' },
    description: 'Create-centered survival. Trains, factories and a lot of andesite.',
    configs: [
      { size: 3_120, format: 'toml', path: 'config/create-common.toml', modifiedAt: '2026-08-20T10:00:00Z' },
      { size: 1_010, format: 'toml', path: 'config/create-client.toml', modifiedAt: '2026-08-20T10:00:00Z' },
      { size: 880, format: 'toml', path: 'config/jei-client.toml', modifiedAt: '2026-07-01T10:00:00Z' }
    ],
    mods: [
      mod({ id: 'create', provider: CF, name: 'Create', latest: '0.5.1.j', author: 'simibubi', version: '0.5.1.i' }),
      mod({ id: 'jei', provider: CF, author: 'mezz', version: '15.20.0.106', name: 'Just Enough Items' }),
      mod({ provider: CF, author: 'xaero96', version: '25.2.10', id: 'xaeros-minimap', name: "Xaero's Minimap" }),
      mod({ provider: MR, id: 'cloth-config', author: 'shedaniel', version: '11.1.136', name: 'Cloth Config API' }),
      mod({
        provider: MR,
        enabled: false,
        id: 'create-fabric',
        name: 'Create Fabric',
        version: '0.5.1-f-build.1417',
        author: 'Fabricators of Create',
        status: UpdateStatus.Incompatible
      })
    ]
  },
  {
    memoryMb: 0,
    icon: 'swords',
    iconColor: '#b08a4a',
    name: 'Friends Server',
    gameId: GameId.Valheim,
    playtimeMinutes: 4_310,
    logs: LOGS.slice(0, 5),
    gameVersion: '0.219.16',
    loader: LoaderId.BepInEx,
    loaderVersion: '5.4.2202',
    id: 'inst-valheim-friends',
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
    lastPlayed: '2026-09-04T22:10:00Z',
    modpack: { version: '2.1.0', modpackId: 'pack-valheim-friends' },
    description: 'Shared setup for the Thursday server. Everyone needs the exact same mod list.',
    configs: [
      { size: 2_200, format: 'cfg', path: 'BepInEx/config/BepInEx.cfg', modifiedAt: '2026-04-01T10:00:00Z' },
      { size: 48_120, format: 'cfg', modifiedAt: '2026-09-02T10:00:00Z', path: 'BepInEx/config/valheim_plus.cfg' },
      { size: 6_400, format: 'cfg', modifiedAt: '2026-08-15T10:00:00Z', path: 'BepInEx/config/randyknapp.mods.epicloot.cfg' }
    ],
    mods: [
      mod({ provider: TS, author: 'denikson', version: '5.4.2202', id: 'bepinex-pack-valheim', name: 'BepInExPack Valheim' }),
      mod({ id: 'jotunn', provider: TS, name: 'Jotunn', latest: '2.24.3', version: '2.24.1', author: 'ValheimModding' }),
      mod({ provider: TS, id: 'valheim-plus', name: 'ValheimPlus', version: '0.9.16.2', author: 'Grantapher' }),
      mod({ provider: TS, id: 'epic-loot', name: 'EpicLoot', latest: '0.10.6', version: '0.10.4', author: 'RandyKnapp' }),
      mod({ provider: TS, author: 'Advize', version: '1.18.2', id: 'plant-everything', name: 'PlantEverything' }),
      mod({
        provider: TS,
        author: 'ishid4',
        version: '1.9.6',
        id: 'better-archery',
        name: 'BetterArchery',
        status: UpdateStatus.Incompatible
      })
    ]
  },
  {
    memoryMb: 0,
    icon: 'skull',
    name: 'Hardcore',
    iconColor: '#7a6a4d',
    gameVersion: '1.20.4',
    id: 'inst-vs-hardcore',
    playtimeMinutes: 1_590,
    logs: LOGS.slice(0, 4),
    loaderVersion: '1.20.4',
    loader: LoaderId.Vanilla,
    gameId: GameId.VintageStory,
    createdAt: '2026-06-20T10:00:00Z',
    updatedAt: '2026-08-28T10:00:00Z',
    lastPlayed: '2026-08-31T15:00:00Z',
    description: 'Permadeath, no map, expanded food and skill progression.',
    configs: [
      { size: 640, format: 'json', path: 'ModConfig/carryon.json', modifiedAt: '2026-08-28T10:00:00Z' },
      { size: 2_130, format: 'json', modifiedAt: '2026-08-28T10:00:00Z', path: 'ModConfig/primitivesurvival.json' }
    ],
    mods: [
      mod({ provider: VS, name: 'Carry On', version: '1.8.0', id: 'vs-carry-on', author: 'copygirl' }),
      mod({
        provider: VS,
        latest: '3.7.4',
        version: '3.7.2',
        author: 'Spear and Fang',
        name: 'Primitive Survival',
        id: 'vs-primitive-survival'
      }),
      mod({
        provider: VS,
        name: 'XSkills',
        author: 'Xandu',
        id: 'vs-xskills',
        version: '0.8.6',
        missingDependency: 'XLib',
        status: UpdateStatus.DependencyMissing
      })
    ]
  },
  {
    memoryMb: 0,
    icon: 'rocket',
    name: 'Modded Run',
    iconColor: '#3f7fbf',
    gameVersion: '1.3.9',
    playtimeMinutes: 820,
    id: 'inst-ror2-modded',
    logs: LOGS.slice(0, 3),
    loader: LoaderId.BepInEx,
    loaderVersion: '5.4.2113',
    gameId: GameId.RiskOfRain2,
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-08-14T10:00:00Z',
    lastPlayed: '2026-08-22T23:40:00Z',
    description: 'Co-op run with item sharing.',
    configs: [{ size: 2_200, format: 'cfg', path: 'BepInEx/config/BepInEx.cfg', modifiedAt: '2026-07-11T10:00:00Z' }],
    mods: [
      mod({ provider: TS, id: 'r2-bepinex', author: 'bbepis', name: 'BepInExPack', version: '5.4.2113' }),
      mod({ id: 'r2api', provider: TS, name: 'R2API', version: '5.1.5', author: 'tristanmcpherson' }),
      mod({ provider: TS, version: '2.11.1', author: 'FunkFrog', name: 'ShareSuffering', id: 'ror2-shared-suffering' })
    ]
  },
  {
    logs: [],
    memoryMb: 0,
    icon: 'moon',
    lastPlayed: null,
    id: 'inst-lethal',
    gameVersion: 'v69',
    playtimeMinutes: 0,
    iconColor: '#c9532f',
    name: 'Company Night',
    loader: LoaderId.BepInEx,
    loaderVersion: '5.4.2100',
    gameId: GameId.LethalCompany,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-21T10:00:00Z',
    description: 'Eight player lobby.',
    configs: [
      {
        size: 410,
        format: 'cfg',
        modifiedAt: '2026-08-21T10:00:00Z',
        path: 'BepInEx/config/me.swipez.melonloader.morecompany.cfg'
      }
    ],
    mods: [
      mod({ provider: TS, id: 'lc-bepinex', author: 'BepInEx', name: 'BepInExPack', version: '5.4.2100' }),
      mod({ provider: TS, version: '1.11.0', id: 'more-company', name: 'MoreCompany', author: 'notnotnotswipez' })
    ]
  }
];
