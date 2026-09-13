export enum ProviderId {
  Modrinth = 'modrinth',
  CurseForge = 'curseforge',
  Thunderstore = 'thunderstore',
  VintageStoryDb = 'vintagestory'
}

export enum GameId {
  Valheim = 'valheim',
  RiskOfRain2 = 'ror2',
  Minecraft = 'minecraft',
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
  ShaderPack = 'shader',
  DataPack = 'datapack',
  ResourcePack = 'resourcepack'
}

export enum UpdateStatus {
  Disabled = 'disabled',
  UpToDate = 'up-to-date',
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
  UpdateMod = 'update-mod',
  InstallMod = 'install-mod',
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
