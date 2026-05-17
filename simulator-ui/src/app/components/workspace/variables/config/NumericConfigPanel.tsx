import React from 'react';
import { NumericVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';

interface NumericConfigPanelProps {
  config: NumericVariableConfig;
  onChange: (newConfig: Partial<NumericVariableConfig>) => void;
}

export const NumericConfigPanel: React.FC<NumericConfigPanelProps> = ({ config, onChange }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="numeric-min">Minimum Value</Label>
          <Input
            id="numeric-min"
            type="number"
            data-testid="numeric-min-input"
            value={config.min ?? 0}
            onChange={(e) => onChange({ min: parseFloat(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numeric-max">Maximum Value</Label>
          <Input
            id="numeric-max"
            type="number"
            data-testid="numeric-max-input"
            value={config.max ?? 100}
            onChange={(e) => onChange({ max: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="numeric-precision">Precision</Label>
        <Select
          value={config.precision ?? 'DOUBLE'}
          onValueChange={(val: any) => onChange({ precision: val })}
        >
          <SelectTrigger id="numeric-precision" data-testid="numeric-precision-trigger">
            <SelectValue placeholder="Select precision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INTEGER">Integer</SelectItem>
            <SelectItem value="FLOAT">Float</SelectItem>
            <SelectItem value="DOUBLE">Double</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="numeric-distribution">Distribution</Label>
        <Select
          value={config.distribution ?? 'UNIFORM'}
          onValueChange={(val: any) => onChange({ distribution: val })}
        >
          <SelectTrigger id="numeric-distribution" data-testid="numeric-distribution-trigger">
            <SelectValue placeholder="Select distribution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UNIFORM">Uniform</SelectItem>
            <SelectItem value="NORMAL">Normal / Gaussian</SelectItem>
            <SelectItem value="EXPONENTIAL">Exponential</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="numeric-formula">Formula (Optional)</Label>
        <Input
          id="numeric-formula"
          type="text"
          data-testid="numeric-formula-input"
          placeholder="e.g. [temperature] * 1.5 + 10"
          value={config.formula ?? ''}
          onChange={(e) => onChange({ formula: e.target.value })}
        />
      </div>
    </div>
  );
};
