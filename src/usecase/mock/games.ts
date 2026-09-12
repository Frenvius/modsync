import type { Game } from '~/domain/interfaces/game.interface';
import type { ProviderMeta } from '~/domain/interfaces/provider.interface';

import { GameId, LoaderId, ProviderId, ProjectType } from '~/domain/enums/provider.enum';

export const GAMES: Array<Game> = [
  {
    id: GameId.Minecraft,
    name: 'Minecraft',
    color: '#5b8c3a',
    ecosystemLabel: 'Modrinth + CurseForge',
    providers: [ProviderId.Modrinth, ProviderId.CurseForge],
    versions: ['1.21.4', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2'],
    loaders: [
      { id: LoaderId.Vanilla, name: 'Vanilla' },
      { id: LoaderId.Fabric, name: 'Fabric', recommended: true },
      { id: LoaderId.Forge, name: 'Forge' },
      { id: LoaderId.NeoForge, name: 'NeoForge' },
      { id: LoaderId.Quilt, name: 'Quilt' }
    ],
    contentTypes: [ProjectType.Mod, ProjectType.ResourcePack, ProjectType.ShaderPack, ProjectType.DataPack]
  },
  {
    id: GameId.Valheim,
    name: 'Valheim',
    color: '#b08a4a',
    ecosystemLabel: 'Thunderstore',
    providers: [ProviderId.Thunderstore],
    versions: ['0.219.16', '0.219.13', '0.218.21', '0.217.46'],
    loaders: [{ id: LoaderId.BepInEx, name: 'BepInEx', recommended: true }],
    contentTypes: [ProjectType.Mod]
  },
  {
    id: GameId.VintageStory,
    name: 'Vintage Story',
    color: '#7a6a4d',
    ecosystemLabel: 'ModDB',
    providers: [ProviderId.VintageStoryDb],
    versions: ['1.20.4', '1.20.1', '1.19.8', '1.19.4', '1.18.15'],
    loaders: [{ id: LoaderId.Vanilla, name: 'Built-in', recommended: true }],
    contentTypes: [ProjectType.Mod]
  },
  {
    id: GameId.RiskOfRain2,
    name: 'Risk of Rain 2',
    color: '#3f7fbf',
    ecosystemLabel: 'Thunderstore',
    providers: [ProviderId.Thunderstore],
    versions: ['1.3.9', '1.3.6', '1.2.4'],
    loaders: [{ id: LoaderId.BepInEx, name: 'BepInEx', recommended: true }],
    contentTypes: [ProjectType.Mod]
  },
  {
    id: GameId.LethalCompany,
    name: 'Lethal Company',
    color: '#c9532f',
    ecosystemLabel: 'Thunderstore',
    providers: [ProviderId.Thunderstore],
    versions: ['v69', 'v64', 'v56', 'v50'],
    loaders: [{ id: LoaderId.BepInEx, name: 'BepInEx', recommended: true }],
    contentTypes: [ProjectType.Mod]
  }
];

export const PROVIDERS: Array<ProviderMeta> = [
  {
    id: ProviderId.Modrinth,
    name: 'Modrinth',
    color: '#1bd96a',
    website: 'https://modrinth.com',
    games: [GameId.Minecraft],
    requiresApiKey: false
  },
  {
    id: ProviderId.CurseForge,
    name: 'CurseForge',
    color: '#f16436',
    website: 'https://curseforge.com',
    games: [GameId.Minecraft],
    requiresApiKey: true
  },
  {
    id: ProviderId.Thunderstore,
    name: 'Thunderstore',
    color: '#4fa3ff',
    website: 'https://thunderstore.io',
    games: [GameId.Valheim, GameId.RiskOfRain2, GameId.LethalCompany],
    requiresApiKey: false
  },
  {
    id: ProviderId.VintageStoryDb,
    name: 'Vintage Story ModDB',
    color: '#d0a45a',
    website: 'https://mods.vintagestory.at',
    games: [GameId.VintageStory],
    requiresApiKey: false
  }
];

export const LOADER_NAMES: Record<LoaderId, string> = {
  [LoaderId.Forge]: 'Forge',
  [LoaderId.Quilt]: 'Quilt',
  [LoaderId.Fabric]: 'Fabric',
  [LoaderId.BepInEx]: 'BepInEx',
  [LoaderId.Vanilla]: 'Vanilla',
  [LoaderId.NeoForge]: 'NeoForge'
};
