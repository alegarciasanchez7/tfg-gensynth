import React from 'react';
import { StringVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../ui/tabs';

interface StringConfigPanelProps {
  config: StringVariableConfig;
  onChange: (newConfig: Partial<StringVariableConfig>) => void;
}

export const StringConfigPanel: React.FC<StringConfigPanelProps> = ({ config, onChange }) => {
  const currentPattern = config.pattern === 'CONSTANT' ? 'CONSTANT' : 'RANDOM_STRING';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>String Generation Mode</Label>
        <Tabs
          value={currentPattern}
          onValueChange={(val: any) => onChange({ pattern: val })}
          className="w-full"
        >
          <TabsList className="bg-[var(--c-bg4)] border-[var(--c-br1)] h-8 p-0.5">
            <TabsTrigger value="RANDOM_STRING" className="text-[10px] py-1">Random Generator</TabsTrigger>
            <TabsTrigger value="CONSTANT" className="text-[10px] py-1">Fixed String (Constant)</TabsTrigger>
          </TabsList>

          <TabsContent value="RANDOM_STRING" className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label htmlFor="string-length">Fixed Length</Label>
              <Input
                id="string-length"
                type="number"
                value={config.fixedLength ?? 8}
                onChange={(e) => onChange({ fixedLength: parseInt(e.target.value) || 0 })}
                className="bg-[var(--c-bg4)] border-[var(--c-br1)] h-8 text-[11px]"
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
                className="bg-[var(--c-bg4)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
              />
              <p className="text-[9px] text-[var(--c-tx4)] mt-1">
                If provided, this pattern will be used instead of standard character generation.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="CONSTANT" className="space-y-2 mt-3">
            <Label htmlFor="string-constant">Constant String Value</Label>
            <Input
              id="string-constant"
              type="text"
              placeholder="e.g. {Macarrones}, active, error_log"
              value={config.constantValue ?? ''}
              onChange={(e) => onChange({ constantValue: e.target.value })}
              className="bg-[var(--c-bg4)] border-[var(--c-br1)] h-8 text-[11px]"
            />
            <p className="text-[9px] text-[var(--c-tx4)]">
              This exact string will be sent on every tick of the simulation.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
