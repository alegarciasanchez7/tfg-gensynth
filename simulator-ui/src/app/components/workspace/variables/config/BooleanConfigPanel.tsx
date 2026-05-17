import React from 'react';
import { BooleanVariableConfig } from '../../../../types';
import { Switch } from '../../../ui/switch';
import { Label } from '../../../ui/label';

interface BooleanConfigPanelProps {
  config: BooleanVariableConfig;
  onChange: (newConfig: Partial<BooleanVariableConfig>) => void;
}

export const BooleanConfigPanel: React.FC<BooleanConfigPanelProps> = ({ config, onChange }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch
          id="boolean-value"
          checked={config.currentValue ?? false}
          onCheckedChange={(checked) => onChange({ currentValue: checked })}
        />
        <Label htmlFor="boolean-value">Fixed Value (Constant)</Label>
      </div>
      <p className="text-xs text-slate-500">
        If disabled, the boolean value will be randomly generated.
      </p>
    </div>
  );
};
