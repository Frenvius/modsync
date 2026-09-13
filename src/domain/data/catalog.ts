import type { Game } from '~/domain/interfaces/game.interface';
import type { ProviderMeta } from '~/domain/interfaces/provider.interface';

import { GameId, LoaderId, ProviderId, ProjectType } from '~/domain/enums/provider.enum';

export const GAMES: Array<Game> = [
  {
    color: '#5b8c3a',
    name: 'Minecraft',
    id: GameId.Minecraft,
    ecosystemLabel: 'Modrinth + CurseForge',
    providers: [ProviderId.Modrinth, ProviderId.CurseForge],
    capabilities: { launch: true, update: true, install: true, importInstance: true },
    contentTypes: [ProjectType.Mod, ProjectType.ResourcePack, ProjectType.ShaderPack, ProjectType.DataPack],
    versions: ['1.21.4', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2'],
    loaders: [
      { name: 'Vanilla', id: LoaderId.Vanilla },
      { name: 'Fabric', recommended: true, id: LoaderId.Fabric },
      { name: 'Forge', id: LoaderId.Forge },
      { name: 'NeoForge', id: LoaderId.NeoForge }
    ]
  },
  {
    name: 'Valheim',
    color: '#b08a4a',
    id: GameId.Valheim,
    ecosystemLabel: 'Thunderstore',
    contentTypes: [ProjectType.Mod],
    providers: [ProviderId.Thunderstore],
    versions: ['0.219.16', '0.219.13', '0.218.21', '0.217.46'],
    loaders: [{ name: 'BepInEx', recommended: true, id: LoaderId.BepInEx }],
    capabilities: { launch: true, update: true, install: true, importInstance: true }
  },
  {
    color: '#7a6a4d',
    name: 'Vintage Story',
    id: GameId.VintageStory,
    ecosystemLabel: 'ModDB',
    contentTypes: [ProjectType.Mod],
    providers: [ProviderId.VintageStoryDb],
    versions: ['1.20.4', '1.20.1', '1.19.8', '1.19.4', '1.18.15'],
    loaders: [{ name: 'Built-in', recommended: true, id: LoaderId.Vanilla }],
    capabilities: { launch: true, update: true, install: true, importInstance: true }
  },
  {
    color: '#c9532f',
    name: 'Lethal Company',
    id: GameId.LethalCompany,
    ecosystemLabel: 'Thunderstore',
    contentTypes: [ProjectType.Mod],
    providers: [ProviderId.Thunderstore],
    versions: ['v69', 'v64', 'v56', 'v50'],
    loaders: [{ name: 'BepInEx', recommended: true, id: LoaderId.BepInEx }],
    capabilities: { launch: true, update: true, install: true, importInstance: true }
  }
];

export const PROVIDERS: Array<ProviderMeta> = [
  {
    name: 'Modrinth',
    color: '#1bd96a',
    requiresApiKey: false,
    id: ProviderId.Modrinth,
    games: [GameId.Minecraft],
    website: 'https://modrinth.com'
  },
  {
    color: '#f16436',
    name: 'CurseForge',
    requiresApiKey: true,
    id: ProviderId.CurseForge,
    games: [GameId.Minecraft],
    website: 'https://curseforge.com'
  },
  {
    color: '#4fa3ff',
    name: 'Thunderstore',
    requiresApiKey: false,
    id: ProviderId.Thunderstore,
    website: 'https://thunderstore.io',
    games: [GameId.Valheim, GameId.LethalCompany]
  },
  {
    color: '#d0a45a',
    requiresApiKey: false,
    name: 'Vintage Story ModDB',
    games: [GameId.VintageStory],
    id: ProviderId.VintageStoryDb,
    website: 'https://mods.vintagestory.at'
  }
];

export const LOADER_NAMES: Record<LoaderId, string> = {
  [LoaderId.Forge]: 'Forge',
  [LoaderId.Fabric]: 'Fabric',
  [LoaderId.BepInEx]: 'BepInEx',
  [LoaderId.Vanilla]: 'Vanilla',
  [LoaderId.NeoForge]: 'NeoForge'
};
