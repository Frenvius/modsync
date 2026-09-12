import type { WizardDraft } from './index';

import React from 'react';

import { cn } from '~/lib/utils';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import InstanceIcon, { INSTANCE_ICONS, INSTANCE_COLORS } from '~/components/commons/InstanceIcon';

interface IdentityStepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}

const IdentityStep = ({ draft, onChange }: IdentityStepProps) => (
  <div className="flex gap-6">
    <div className="flex flex-col items-center gap-3">
      <InstanceIcon size="xl" icon={draft.icon} color={draft.color} />
      <div className="flex flex-wrap justify-center gap-1.5" style={{ maxWidth: 120 }}>
        {INSTANCE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            style={{ background: color }}
            onClick={() => onChange({ color })}
            className={cn('size-5 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110', draft.color === color && 'ring-2 ring-foreground')}
          />
        ))}
      </div>
    </div>
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="instance-name">Instance name</Label>
        <Input id="instance-name" autoFocus value={draft.name} placeholder="e.g. Create Survival" onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Icon</Label>
        <div className="grid grid-cols-7 gap-2">
          {Object.keys(INSTANCE_ICONS).map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={icon}
              onClick={() => onChange({ icon })}
              className={cn('rounded-lg p-0.5 transition-all hover:scale-105', draft.icon === icon && 'ring-2 ring-primary')}
            >
              <InstanceIcon size="sm" icon={icon} color={draft.color} />
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default IdentityStep;
