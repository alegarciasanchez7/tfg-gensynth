import React from 'react';
import { PointVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

interface PointConfigPanelProps {
  config: PointVariableConfig;
  onChange: (newConfig: Partial<PointVariableConfig>) => void;
}

export const PointConfigPanel: React.FC<PointConfigPanelProps> = ({ config, onChange }) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="point-step">Max Step Distance (Continuous Movement)</Label>
        <Input
          id="point-step"
          type="number"
          step="0.1"
          placeholder="e.g. 5.0"
          value={config.maxStepDistance ?? ''}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            onChange({ maxStepDistance: isNaN(val) ? undefined : val });
          }}
        />
        <p className="text-xs text-slate-500 mt-1">
          If provided, the point will move smoothly (random walk) instead of teleporting randomly.
        </p>
      </div>
    </div>
  );
};
