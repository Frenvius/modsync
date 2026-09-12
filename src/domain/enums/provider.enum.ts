export enum ProviderId {
  Modrinth = 'modrinth',
  CurseForge = 'curseforge',
  Thunderstore = 'thunderstore',
  VintageStoryDb = 'vintagestory'
}

export enum GameId {
  Valheim = 'valheim',
  Minecraft = 'minecraft',
  RiskOfRain2 = 'ror2',
  VintageStory = 'vintagestory',
  LethalCompany = 'lethal-company'
}

export enum LoaderId {
  Forge = 'forge',
  Quilt = 'quilt',
  Fabric = 'fabric',
  BepInEx = 'bepinex',
  Vanilla = 'vanilla',
  NeoForge = 'neoforge'
}

export enum ProjectType {
  Mod = 'mod',
  Modpack = 'modpack',
  ShaderPack = 'shader',
  DataPack = 'datapack',
  ResourcePack = 'resourcepack'
}

export enum UpdateStatus {
  UpToDate = 'up-to-date',
  Disabled = 'disabled',
  Incompatible = 'incompatible',
  UpdateAvailable = 'update-available',
  DependencyMissing = 'dependency-missing'
}

export enum DependencyType {
  Optional = 'optional',
  Required = 'required',
  Incompatible = 'incompatible'
}

export enum DownloadKind {
  InstallMod = 'install-mod',
  UpdateMod = 'update-mod',
  InstallModpack = 'install-modpack',
  DownloadGameVersion = 'download-game'
}

export enum DownloadStatus {
  Paused = 'paused',
  Queued = 'queued',
  Failed = 'failed',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled'
}
