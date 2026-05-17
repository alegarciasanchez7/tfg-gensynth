import React from 'react';
import { StringVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';

interface StringConfigPanelProps {
  config: StringVariableConfig;
  onChange: (newConfig: Partial<StringVariableConfig>) => void;
}

export const StringConfigPanel: React.FC<StringConfigPanelProps> = ({ config, onChange }) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="string-length">Fixed Length</Label>
        <Input
          id="string-length"
          type="number"
          value={config.fixedLength ?? 8}
          onChange={(e) => onChange({ fixedLength: parseInt(e.target.value) })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="string-regex">Regex Pattern (Optional)</Label>
        <Input
          id="string-regex"
          type="text"
          placeholder="e.g. ^[a-zA-Z0-9]{10}$"
          value={config.regexPattern ?? ''}
          onChange={(e) => onChange({ regexPattern: e.target.value })}
        />
        <p className="text-xs text-slate-500 mt-1">
          If provided, this pattern will be used instead of standard character generation.
        </p>
      </div>
    </div>
  );
};
