import type { Modpack, ModpackMod } from '~/domain/interfaces/modpack.interface';

import { colorFor } from '~/usecase/mock/projects';
import { GameId, LoaderId, ProviderId } from '~/domain/enums/provider.enum';

const pm = (projectId: string, name: string, version: string, provider: ProviderId, pinned = false): ModpackMod => ({
  name,
  pinned,
  version,
  provider,
  projectId,
  iconColor: colorFor(projectId)
});

const MR = ProviderId.Modrinth;
const CF = ProviderId.CurseForge;
const TS = ProviderId.Thunderstore;

export const MODPACKS: Array<Modpack> = [
  {
    version: '1.4.0',
    author: 'frenvius',
    gameVersion: '1.20.1',
    shareCode: 'MC-4F8QA',
    coverColor: '#f16436',
    loader: LoaderId.Forge,
    name: 'Create Survival',
    gameId: GameId.Minecraft,
    id: 'pack-create-survival',
    updatedAt: '2026-08-20T10:00:00Z',
    sourceInstanceId: 'inst-create-survival',
    description: 'Create-centered survival pack. Balanced progression with trains, contraptions and just enough utility.',
    mods: [
      pm('create', 'Create', '0.5.1.j', CF, true),
      pm('jei', 'Just Enough Items', '15.20.0.106', CF),
      pm('xaeros-minimap', "Xaero's Minimap", '25.2.10', CF),
      pm('cloth-config', 'Cloth Config API', '11.1.136', MR)
    ],
    releases: [
      {
        version: '1.4.0',
        date: '2026-08-20T10:00:00Z',
        changelog: 'Pinned Create 0.5.1.j. Added Cloth Config as required library.'
      },
      { version: '1.3.2', date: '2026-07-02T10:00:00Z', changelog: 'Updated JEI. Removed Create Fabric (incompatible).' },
      { version: '1.3.0', date: '2026-05-18T10:00:00Z', changelog: 'Initial public release.' }
    ]
  },
  {
    version: '2.1.0',
    author: 'frenvius',
    shareCode: 'VH-7K29P',
    coverColor: '#b08a4a',
    name: 'Friends Server',
    gameId: GameId.Valheim,
    gameVersion: '0.219.16',
    loader: LoaderId.BepInEx,
    id: 'pack-valheim-friends',
    updatedAt: '2026-09-02T10:00:00Z',
    sourceInstanceId: 'inst-valheim-friends',
    description: 'Exact mod list for the Thursday server. Install this and you are ready to join.',
    mods: [
      pm('bepinex-pack-valheim', 'BepInExPack Valheim', '5.4.2202', TS, true),
      pm('jotunn', 'Jotunn', '2.24.3', TS),
      pm('valheim-plus', 'ValheimPlus', '0.9.16.2', TS, true),
      pm('epic-loot', 'EpicLoot', '0.10.6', TS),
      pm('plant-everything', 'PlantEverything', '1.18.2', TS)
    ],
    releases: [
      {
        version: '2.1.0',
        date: '2026-09-02T10:00:00Z',
        changelog: 'EpicLoot 0.10.6, Jotunn 2.24.3. Dropped BetterArchery (broken on 0.219).'
      },
      { version: '2.0.0', date: '2026-07-20T10:00:00Z', changelog: 'Game version bump to 0.219.x. All mods re-pinned.' }
    ]
  },
  {
    version: '3.0.1',
    author: 'Community',
    gameVersion: '1.21.4',
    shareCode: 'MC-PERF1',
    coverColor: '#1bd96a',
    loader: LoaderId.Fabric,
    gameId: GameId.Minecraft,
    name: 'Fabric Performance',
    id: 'pack-fabric-performance',
    updatedAt: '2026-09-01T10:00:00Z',
    description: 'Pure performance stack: Sodium, Lithium, Iris. No gameplay changes.',
    releases: [{ version: '3.0.1', date: '2026-09-01T10:00:00Z', changelog: 'Updated for 1.21.4.' }],
    mods: [
      pm('fabric-api', 'Fabric API', '0.115.2+1.21.4', MR),
      pm('sodium', 'Sodium', '0.6.9', MR),
      pm('lithium', 'Lithium', '0.14.7', MR),
      pm('iris', 'Iris Shaders', '1.8.8', MR),
      pm('mod-menu', 'Mod Menu', '13.0.3', MR)
    ]
  },
  {
    version: '1.0.3',
    author: 'FunkFrog',
    id: 'pack-ror2-coop',
    gameVersion: '1.3.9',
    shareCode: 'RR-COOP3',
    coverColor: '#3f7fbf',
    loader: LoaderId.BepInEx,
    gameId: GameId.RiskOfRain2,
    name: 'RoR2 Co-op Essentials',
    updatedAt: '2026-08-14T10:00:00Z',
    description: 'Minimal co-op quality-of-life set.',
    releases: [{ version: '1.0.3', date: '2026-08-14T10:00:00Z', changelog: 'ShareSuffering 2.11.1.' }],
    mods: [
      pm('r2-bepinex', 'BepInExPack', '5.4.2113', TS, true),
      pm('r2api', 'R2API', '5.1.5', TS),
      pm('ror2-shared-suffering', 'ShareSuffering', '2.11.1', TS)
    ]
  }
];
