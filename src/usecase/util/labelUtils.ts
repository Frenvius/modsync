export const getStageLabel = (stage: string): string => {
  switch (stage) {
    case 'downloading_minecraft':
      return 'Downloading Minecraft...';
    case 'extracting_natives':
      return 'Extracting natives...';
    case 'installing_loader':
      return 'Installing loader...';
    case 'installing_bepinex':
      return 'Installing BepInEx...';
    case 'downloading_mods':
      return 'Downloading mods...';
    case 'complete':
      return 'Complete!';
    default:
      return 'Installing...';
  }
};
