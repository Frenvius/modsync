import type { WizardDraft } from './types';

import { INSTANCE_COLORS } from '~/components/commons/InstanceIcon/constants';

export const STEPS = ['Version', 'Loader', 'Identity', 'Create'];
export const EMPTY_WIZARD_DRAFT: WizardDraft = { name: '', icon: 'sparkles', color: INSTANCE_COLORS[0] };
export const LOADER_DESCRIPTIONS: Record<string, string> = {
  neoforge: 'Modern fork of Forge with active development.',
  forge: 'The classic loader with the largest catalog of older mods.',
  vanilla: 'No mod loader. Resource packs, shaders and data packs only.',
  fabric: 'Lightweight, fast updates, best for performance and client mods.',
  bepinex: 'Unity plugin framework. Required by nearly every mod for this game.'
};
