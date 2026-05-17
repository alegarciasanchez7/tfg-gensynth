import React from 'react';
import { TemporalVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';

interface TemporalConfigPanelProps {
  config: TemporalVariableConfig;
  onChange: (newConfig: Partial<TemporalVariableConfig>) => void;
}

const PRESETS: Record<string, string[]> = {
  DATE: ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM-dd-yyyy', 'yyyy.MM.dd'],
  TIMESTAMP: ["yyyy-MM-dd'T'HH:mm:ss.SSSZ", 'ISO_INSTANT', 'UNIX_TIMESTAMP', 'yyyy-MM-dd HH:mm:ss'],
  TIME: ['HH:mm:ss', 'HH:mm', 'HH:mm:ss.SSS', 'hh:mm a']
};

export const TemporalConfigPanel: React.FC<TemporalConfigPanelProps> = ({ config, onChange }) => {
  const tType = config.temporalType ?? 'TIMESTAMP';
  const presets = PRESETS[tType] || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="temporal-type">Output Category</Label>
          <Select
            value={tType}
            onValueChange={(val: any) => {
              const defaultFormat = PRESETS[val][0];
              onChange({ temporalType: val, dateFormat: defaultFormat });
            }}
          >
            <SelectTrigger id="temporal-type" className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
              <SelectItem value="DATE" className="text-[11px]">Date Only</SelectItem>
              <SelectItem value="TIMESTAMP" className="text-[11px]">Full Timestamp</SelectItem>
              <SelectItem value="TIME" className="text-[11px]">Time Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date-format-preset">Format Preset</Label>
          <Select
            value={presets.includes(config.dateFormat ?? '') ? config.dateFormat : 'custom'}
            onValueChange={(val: string) => {
              if (val !== 'custom') {
                onChange({ dateFormat: val });
              }
            }}
          >
            <SelectTrigger id="date-format-preset" className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]">
              <SelectValue placeholder="Select preset" />
            </SelectTrigger>
            <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
              {presets.map(p => (
                <SelectItem key={p} value={p} className="text-[11px] font-mono">{p}</SelectItem>
              ))}
              <SelectItem value="custom" className="text-[11px]">Custom...</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="date-format" className="flex justify-between">
          <span>Custom Format</span>
          <span className="text-[9px] text-[var(--c-tx4)] font-normal uppercase tracking-wider">Java DateTimeFormatter</span>
        </Label>
        <Input
          id="date-format"
          type="text"
          placeholder="e.g. yyyy-MM-dd'T'HH:mm:ss.SSSZ"
          value={config.dateFormat ?? ''}
          onChange={(e) => onChange({ dateFormat: e.target.value })}
          className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
        />
        <p className="text-[9px] text-[var(--c-tx4)] opacity-70">
          Standard Java DateTimeFormatter pattern. Use 'UNIX_TIMESTAMP' for epoch milliseconds.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="date-timezone">Time Zone</Label>
        <Input
          id="date-timezone"
          type="text"
          placeholder="e.g. UTC, Europe/Madrid, Offset-05:00"
          value={config.timeZone ?? ''}
          onChange={(e) => onChange({ timeZone: e.target.value })}
          className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
        />
      </div>
    </div>
  );
};
