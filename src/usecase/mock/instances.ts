import type { Instance, InstalledMod } from '~/domain/interfaces/instance.interface';

import { GameId, LoaderId, ProviderId, ProjectType, UpdateStatus } from '~/domain/enums/provider.enum';
import { colorFor } from '~/usecase/mock/projects';

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
  author: seed.author,
  projectId: seed.id,
  provider: seed.provider,
  enabled: seed.enabled ?? true,
  iconColor: colorFor(seed.id),
  type: seed.type ?? ProjectType.Mod,
  installedVersion: seed.version,
  latestCompatibleVersion: seed.latest ?? seed.version,
  missingDependency: seed.missingDependency,
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
  { level: 'warn' as const, timestamp: '2026-09-05T20:41:07Z', message: 'Mod "BetterArchery" targets an older game version, loading anyway' },
  { level: 'info' as const, timestamp: '2026-09-05T20:41:12Z', message: 'Game process started (pid 18422)' },
  { level: 'error' as const, timestamp: '2026-09-05T20:44:31Z', message: 'Mixin apply failed for optional injector in sodium-extras, skipped' },
  { level: 'info' as const, timestamp: '2026-09-05T21:02:10Z', message: 'Game process exited with code 0' }
];

export const INSTANCES: Array<Instance> = [
  {
    id: 'inst-vanilla-plus',
    name: 'Vanilla+',
    icon: 'sparkles',
    iconColor: '#1bd96a',
    gameId: GameId.Minecraft,
    gameVersion: '1.21.4',
    loader: LoaderId.Fabric,
    loaderVersion: '0.16.10',
    description: 'Lightweight quality-of-life pack. Keeps the vanilla feel with performance and UI improvements.',
    createdAt: '2026-05-12T10:00:00Z',
    updatedAt: '2026-09-04T18:12:00Z',
    lastPlayed: '2026-09-05T21:02:00Z',
    playtimeMinutes: 6_240,
    memoryMb: 4096,
    javaArgs: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50',
    mods: [
      mod({ id: 'fabric-api', name: 'Fabric API', author: 'FabricMC', provider: MR, version: '0.114.0+1.21.4', latest: '0.115.2+1.21.4' }),
      mod({ id: 'sodium', name: 'Sodium', author: 'jellysquid3', provider: MR, version: '0.6.9' }),
      mod({ id: 'lithium', name: 'Lithium', author: 'jellysquid3', provider: MR, version: '0.14.5', latest: '0.14.7' }),
      mod({ id: 'iris', name: 'Iris Shaders', author: 'coderbot', provider: MR, version: '1.7.6', latest: '1.8.8' }),
      mod({ id: 'mod-menu', name: 'Mod Menu', author: 'Prospector', provider: MR, version: '13.0.3' }),
      mod({ id: 'rei', name: 'Roughly Enough Items', author: 'shedaniel', provider: MR, version: '18.0.796' }),
      mod({ id: 'cloth-config', name: 'Cloth Config API', author: 'shedaniel', provider: MR, version: '17.0.144' }),
      mod({ id: 'architectury', name: 'Architectury API', author: 'shedaniel', provider: MR, version: '15.0.3' }),
      mod({ id: 'xaeros-minimap', name: "Xaero's Minimap", author: 'xaero96', provider: CF, version: '25.2.8', latest: '25.2.10' }),
      mod({
        id: 'complementary-reimagined',
        name: 'Complementary Shaders - Reimagined',
        author: 'EminGT',
        provider: MR,
        version: 'r5.5.1',
        type: ProjectType.ShaderPack
      }),
      mod({ id: 'faithful-32', name: 'Faithful 32x', author: 'Faithful Team', provider: CF, version: '1.21.4', type: ProjectType.ResourcePack }),
      mod({ id: 'terralith', name: 'Terralith', author: 'Starmute', provider: MR, version: '2.5.8', type: ProjectType.DataPack, enabled: false, status: UpdateStatus.Disabled })
    ],
    configs: [
      { path: 'config/sodium-options.json', format: 'json', size: 1_204, modifiedAt: '2026-09-01T10:00:00Z' },
      { path: 'config/iris.properties', format: 'properties', size: 512, modifiedAt: '2026-08-30T10:00:00Z' },
      { path: 'config/lithium.properties', format: 'properties', size: 388, modifiedAt: '2026-08-12T10:00:00Z' },
      { path: 'config/xaerominimap.txt', format: 'cfg', size: 2_910, modifiedAt: '2026-09-04T10:00:00Z' },
      { path: 'options.txt', format: 'properties', size: 4_420, modifiedAt: '2026-09-05T10:00:00Z' }
    ],
    logs: LOGS
  },
  {
    id: 'inst-create-survival',
    name: 'Create Survival',
    icon: 'cog',
    iconColor: '#f16436',
    gameId: GameId.Minecraft,
    gameVersion: '1.20.1',
    loader: LoaderId.Forge,
    loaderVersion: '47.3.12',
    description: 'Create-centered survival. Trains, factories and a lot of andesite.',
    createdAt: '2026-02-03T10:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    lastPlayed: '2026-09-03T19:30:00Z',
    playtimeMinutes: 11_820,
    memoryMb: 8192,
    modpack: { modpackId: 'pack-create-survival', version: '1.4.0' },
    mods: [
      mod({ id: 'create', name: 'Create', author: 'simibubi', provider: CF, version: '0.5.1.i', latest: '0.5.1.j' }),
      mod({ id: 'jei', name: 'Just Enough Items', author: 'mezz', provider: CF, version: '15.20.0.106' }),
      mod({ id: 'xaeros-minimap', name: "Xaero's Minimap", author: 'xaero96', provider: CF, version: '25.2.10' }),
      mod({ id: 'cloth-config', name: 'Cloth Config API', author: 'shedaniel', provider: MR, version: '11.1.136' }),
      mod({
        id: 'create-fabric',
        name: 'Create Fabric',
        author: 'Fabricators of Create',
        provider: MR,
        version: '0.5.1-f-build.1417',
        status: UpdateStatus.Incompatible,
        enabled: false
      })
    ],
    configs: [
      { path: 'config/create-common.toml', format: 'toml', size: 3_120, modifiedAt: '2026-08-20T10:00:00Z' },
      { path: 'config/create-client.toml', format: 'toml', size: 1_010, modifiedAt: '2026-08-20T10:00:00Z' },
      { path: 'config/jei-client.toml', format: 'toml', size: 880, modifiedAt: '2026-07-01T10:00:00Z' }
    ],
    logs: LOGS.slice(0, 6)
  },
  {
    id: 'inst-valheim-friends',
    name: 'Friends Server',
    icon: 'swords',
    iconColor: '#b08a4a',
    gameId: GameId.Valheim,
    gameVersion: '0.219.16',
    loader: LoaderId.BepInEx,
    loaderVersion: '5.4.2202',
    description: 'Shared setup for the Thursday server. Everyone needs the exact same mod list.',
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
    lastPlayed: '2026-09-04T22:10:00Z',
    playtimeMinutes: 4_310,
    memoryMb: 0,
    modpack: { modpackId: 'pack-valheim-friends', version: '2.1.0' },
    mods: [
      mod({ id: 'bepinex-pack-valheim', name: 'BepInExPack Valheim', author: 'denikson', provider: TS, version: '5.4.2202' }),
      mod({ id: 'jotunn', name: 'Jotunn', author: 'ValheimModding', provider: TS, version: '2.24.1', latest: '2.24.3' }),
      mod({ id: 'valheim-plus', name: 'ValheimPlus', author: 'Grantapher', provider: TS, version: '0.9.16.2' }),
      mod({ id: 'epic-loot', name: 'EpicLoot', author: 'RandyKnapp', provider: TS, version: '0.10.4', latest: '0.10.6' }),
      mod({ id: 'plant-everything', name: 'PlantEverything', author: 'Advize', provider: TS, version: '1.18.2' }),
      mod({
        id: 'better-archery',
        name: 'BetterArchery',
        author: 'ishid4',
        provider: TS,
        version: '1.9.6',
        status: UpdateStatus.Incompatible
      })
    ],
    configs: [
      { path: 'BepInEx/config/BepInEx.cfg', format: 'cfg', size: 2_200, modifiedAt: '2026-04-01T10:00:00Z' },
      { path: 'BepInEx/config/valheim_plus.cfg', format: 'cfg', size: 48_120, modifiedAt: '2026-09-02T10:00:00Z' },
      { path: 'BepInEx/config/randyknapp.mods.epicloot.cfg', format: 'cfg', size: 6_400, modifiedAt: '2026-08-15T10:00:00Z' }
    ],
    logs: LOGS.slice(0, 5)
  },
  {
    id: 'inst-vs-hardcore',
    name: 'Hardcore',
    icon: 'skull',
    iconColor: '#7a6a4d',
    gameId: GameId.VintageStory,
    gameVersion: '1.20.4',
    loader: LoaderId.Vanilla,
    loaderVersion: '1.20.4',
    description: 'Permadeath, no map, expanded food and skill progression.',
    createdAt: '2026-06-20T10:00:00Z',
    updatedAt: '2026-08-28T10:00:00Z',
    lastPlayed: '2026-08-31T15:00:00Z',
    playtimeMinutes: 1_590,
    memoryMb: 0,
    mods: [
      mod({ id: 'vs-carry-on', name: 'Carry On', author: 'copygirl', provider: VS, version: '1.8.0' }),
      mod({ id: 'vs-primitive-survival', name: 'Primitive Survival', author: 'Spear and Fang', provider: VS, version: '3.7.2', latest: '3.7.4' }),
      mod({
        id: 'vs-xskills',
        name: 'XSkills',
        author: 'Xandu',
        provider: VS,
        version: '0.8.6',
        status: UpdateStatus.DependencyMissing,
        missingDependency: 'XLib'
      })
    ],
    configs: [
      { path: 'ModConfig/carryon.json', format: 'json', size: 640, modifiedAt: '2026-08-28T10:00:00Z' },
      { path: 'ModConfig/primitivesurvival.json', format: 'json', size: 2_130, modifiedAt: '2026-08-28T10:00:00Z' }
    ],
    logs: LOGS.slice(0, 4)
  },
  {
    id: 'inst-ror2-modded',
    name: 'Modded Run',
    icon: 'rocket',
    iconColor: '#3f7fbf',
    gameId: GameId.RiskOfRain2,
    gameVersion: '1.3.9',
    loader: LoaderId.BepInEx,
    loaderVersion: '5.4.2113',
    description: 'Co-op run with item sharing.',
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-08-14T10:00:00Z',
    lastPlayed: '2026-08-22T23:40:00Z',
    playtimeMinutes: 820,
    memoryMb: 0,
    mods: [
      mod({ id: 'r2-bepinex', name: 'BepInExPack', author: 'bbepis', provider: TS, version: '5.4.2113' }),
      mod({ id: 'r2api', name: 'R2API', author: 'tristanmcpherson', provider: TS, version: '5.1.5' }),
      mod({ id: 'ror2-shared-suffering', name: 'ShareSuffering', author: 'FunkFrog', provider: TS, version: '2.11.1' })
    ],
    configs: [{ path: 'BepInEx/config/BepInEx.cfg', format: 'cfg', size: 2_200, modifiedAt: '2026-07-11T10:00:00Z' }],
    logs: LOGS.slice(0, 3)
  },
  {
    id: 'inst-lethal',
    name: 'Company Night',
    icon: 'moon',
    iconColor: '#c9532f',
    gameId: GameId.LethalCompany,
    gameVersion: 'v69',
    loader: LoaderId.BepInEx,
    loaderVersion: '5.4.2100',
    description: 'Eight player lobby.',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-21T10:00:00Z',
    lastPlayed: null,
    playtimeMinutes: 0,
    memoryMb: 0,
    mods: [
      mod({ id: 'lc-bepinex', name: 'BepInExPack', author: 'BepInEx', provider: TS, version: '5.4.2100' }),
      mod({ id: 'more-company', name: 'MoreCompany', author: 'notnotnotswipez', provider: TS, version: '1.11.0' })
    ],
    configs: [{ path: 'BepInEx/config/me.swipez.melonloader.morecompany.cfg', format: 'cfg', size: 410, modifiedAt: '2026-08-21T10:00:00Z' }],
    logs: []
  }
];
