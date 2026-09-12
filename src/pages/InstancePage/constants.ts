import { ProjectType } from '~/domain/enums/provider.enum';

export const CONTENT_TAB_LABELS: Record<ProjectType, string> = {
  [ProjectType.Mod]: 'Mods',
  [ProjectType.Modpack]: 'Modpacks',
  [ProjectType.DataPack]: 'Data Packs',
  [ProjectType.ShaderPack]: 'Shader Packs',
  [ProjectType.ResourcePack]: 'Resource Packs'
};
