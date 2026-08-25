import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../../../context';
import { StringVariableConfig, StringFormattedMaskType, StringCorruptionMode } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';
import { Switch } from '../../../ui/switch';
import { CustomDropdown } from '../../../ui/custom-dropdown';
import { ShieldAlert, Sparkles, Braces, Code } from 'lucide-react';

interface StringConfigPanelProps {
  config: StringVariableConfig;
  onChange: (newConfig: Partial<StringVariableConfig>) => void;
  flowId?: string;
  groupId?: string;
}

const MASK_OPTIONS = [
  { value: 'MAC_ADDRESS', label: 'MAC Address (XX:XX:XX:XX:XX:XX)' },
  { value: 'IPV4', label: 'IPv4 Address' },
  { value: 'IPV6', label: 'IPv6 Address' },
  { value: 'UUID_V4', label: 'UUID v4' },
  { value: 'ALPHANUMERIC', label: 'Random Alphanumeric' },
  { value: 'CUSTOM_MASK', label: 'Custom Format Mask' },
];

const CORRUPTION_OPTIONS = [
  { value: 'TRUNCATE', label: 'Truncate end of string' },
  { value: 'INJECT_ANOMALOUS', label: 'Inject anomalous characters' },
  { value: 'REPLACE_CHAR', label: 'Replace characters randomly' },
  { value: 'NULL_BYTE', label: 'Inject Null Byte (\\0)' },
  { value: 'MIXED', label: 'Mixed / Random corruption' },
];

export const StringConfigPanel: React.FC<StringConfigPanelProps> = ({ 
  config, 
  onChange,
  flowId,
  groupId 
}) => {
  const currentPattern = config.pattern || 'RANDOM_STRING';
  
  // Autocomplete Logic
  const { state } = useApp();
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const templateValue = config.template ?? '';

  // Tokenize the template for inline validation overlay
  const templateTokens = useMemo(() => {
    const parts: Array<{ text: string; isValid?: boolean; isVariable?: boolean }> = [];
    const regex = /(\{\{[^}]+\}\})/g;
    let lastIndex = 0;
    let match;
 
    while ((match = regex.exec(templateValue)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: templateValue.substring(lastIndex, match.index) });
      }
 
      const rawToken = match[1];
      const varName = rawToken.substring(2, rawToken.length - 2).trim();
      
      const variable = state.variables?.find(v => {
        if (v.name !== varName) return false;
        if (v.scope === 'global') return true;
        if (v.scope === 'group') return v.groupId === groupId;
        if (v.scope === 'local') return v.flowId === flowId;
        return false;
      });

      parts.push({
        text: rawToken,
        isValid: !!variable,
        isVariable: true
      });
      
      lastIndex = regex.lastIndex;
    }
 
    if (lastIndex < templateValue.length) {
      parts.push({ text: templateValue.substring(lastIndex) });
    }
 
    return parts;
  }, [templateValue, state.variables, flowId, groupId]);

  // Extract seen variables to display feedback badges underneath
  const templateVariables = useMemo(() => {
    const vars: Array<{ name: string; isValid: boolean; scope?: string }> = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    const seen = new Set<string>();
 
    while ((match = regex.exec(templateValue)) !== null) {
      const varName = match[1].trim();
      if (seen.has(varName)) continue;
      seen.add(varName);
 
      const variable = state.variables?.find(v => {
        if (v.name !== varName) return false;
        if (v.scope === 'global') return true;
        if (v.scope === 'group') return v.groupId === groupId;
        if (v.scope === 'local') return v.flowId === flowId;
        return false;
      });
 
      vars.push({
        name: varName,
        isValid: !!variable,
        scope: variable?.scope
      });
    }

    return vars;
  }, [templateValue, state.variables, flowId, groupId]);

  const autocompleteOptions = useMemo(() => {
    if (!showAutocomplete || !state.variables) return [];

    const value = inputRef.current ? inputRef.current.value : (config.template ?? '');
    const textBeforeCursor = cursorPos > 0 ? value.substring(0, cursorPos) : value;
    const lastOpen = textBeforeCursor.lastIndexOf('{{');
    if (lastOpen === -1) return [];

    const query = textBeforeCursor.substring(lastOpen + 2).toLowerCase();

    // Filter variables that are at least potentially valid (current scope)
    const options = state.variables
      .filter(v => {
        if (v.scope === 'global') return true;
        if (v.scope === 'group') return v.groupId === groupId;
        if (v.scope === 'local') return v.flowId === flowId;
        return false;
      })
      .map(v => ({ name: v.name, scope: v.scope }));

    return options.filter(o => {
      const full = `${o.scope}.${o.name}`.toLowerCase();
      return full.includes(query) || o.name.toLowerCase().includes(query);
    });
  }, [showAutocomplete, config.template, cursorPos, state.variables, flowId, groupId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteOptions.length]);

  const insertAtCursor = (varName: string) => {
    const ta = inputRef.current;
    if (!ta) return;

    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const value = config.template ?? '';
    const textBefore = value.substring(0, start);
    
    // Check if we should replace a partially typed {{...
    const lastOpen = textBefore.lastIndexOf('{{');
    let finalStart = start;
    if (lastOpen !== -1 && lastOpen >= textBefore.lastIndexOf('}}')) {
      finalStart = lastOpen;
    }
    
    const replacement = `{{${varName}}}`;
    const newValue = value.substring(0, finalStart) + replacement + value.substring(end);
    
    onChange({ template: newValue });
    
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const newPos = finalStart + replacement.length;
        ta.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const insertOption = (opt: { name: string; scope: string }) => {
    insertAtCursor(opt.name);
    setShowAutocomplete(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showAutocomplete && autocompleteOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % autocompleteOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + autocompleteOptions.length) % autocompleteOptions.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertOption(autocompleteOptions[selectedIndex]);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        insertOption(autocompleteOptions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === '{') {
      const start = inputRef.current?.selectionStart || 0;
      const value = inputRef.current ? inputRef.current.value : (config.template ?? '');
      const textBefore = value.substring(0, start);
      if (textBefore.endsWith('{')) {
        setShowAutocomplete(true);
        setCursorPos(start + 1);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[10px] uppercase text-[var(--c-tx4)]">String Generation Mode</Label>
        <Tabs
          value={currentPattern}
          onValueChange={(val: any) => onChange({ pattern: val })}
          className="w-full"
        >
          <TabsList className="bg-[var(--c-bg4)] border-[var(--c-br1)] h-8 p-0.5 grid grid-cols-5">
            <TabsTrigger value="RANDOM_STRING" className="text-[9px] py-1">Random</TabsTrigger>
            <TabsTrigger value="REGEX" className="text-[9px] py-1">Regex</TabsTrigger>
            <TabsTrigger value="CONSTANT" className="text-[9px] py-1">Fixed</TabsTrigger>
            <TabsTrigger value="TEMPLATE" className="text-[9px] py-1">Template</TabsTrigger>
            <TabsTrigger value="FORMATTED_MASK" className="text-[9px] py-1">Mask/IoT</TabsTrigger>
          </TabsList>

          {/* 1. RANDOM_STRING */}
          <TabsContent value="RANDOM_STRING" className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label htmlFor="string-length">Fixed Length</Label>
              <Input
                id="string-length"
                type="number"
                value={config.fixedLength ?? 8}
                onChange={(e) => onChange({ fixedLength: parseInt(e.target.value) || 0 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
              />
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-300/90">
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
              <span>Generates a random string using A-Z, a-z, 0-9.</span>
            </div>
          </TabsContent>

          {/* 2. REGEX */}
          <TabsContent value="REGEX" className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label htmlFor="string-regex">Regex Pattern</Label>
              <Input
                id="string-regex"
                type="text"
                placeholder="e.g. ^[a-zA-Z0-9]{10}$"
                value={config.regexPattern ?? ''}
                onChange={(e) => onChange({ regexPattern: e.target.value })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono"
              />
              <p className="text-[9px] text-[var(--c-tx4)] mt-1">
                Generates a valid string that matches the provided regular expression.
              </p>
            </div>
          </TabsContent>

          {/* 3. CONSTANT */}
          <TabsContent value="CONSTANT" className="space-y-2 mt-3">
            <Label htmlFor="string-constant">Constant String Value</Label>
            <Input
              id="string-constant"
              type="text"
              placeholder="e.g. {Macarrones}, active, error_log"
              value={config.constantValue ?? ''}
              onChange={(e) => onChange({ constantValue: e.target.value })}
              className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
            />
            <p className="text-[9px] text-[var(--c-tx4)]">
              This exact string will be sent on every tick of the simulation.
            </p>
          </TabsContent>

          {/* 4. TEMPLATE */}
          <TabsContent value="TEMPLATE" className="space-y-4 mt-3">
            <div className="space-y-2 relative">
              <Label htmlFor="string-template">Dynamic Template String</Label>
              
              <div className="relative flex items-center">
                <Braces className="absolute left-2.5 z-20 h-4 w-4 text-[var(--c-tx4)]" />
                
                {/* Highlighting Overlay */}
                <div 
                  ref={overlayRef}
                  className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none whitespace-pre overflow-hidden flex items-center pl-9 pr-3 bg-transparent text-transparent text-[11px] font-mono border border-transparent h-8"
                >
                  {templateTokens.map((t, i) => (
                    <span 
                      key={i} 
                      className={t.isVariable ? (t.isValid ? 'bg-emerald-500/20 text-emerald-400 rounded ring-1 ring-inset ring-emerald-500/40 px-0.5 -mx-0.5' : 'bg-red-500/20 text-red-400 rounded ring-1 ring-inset ring-red-500/40 px-0.5 -mx-0.5') : 'text-[var(--c-tx2)]'}
                    >
                      {t.text}
                    </span>
                  ))}
                </div>

                <input
                  ref={inputRef}
                  id="string-template"
                  type="text"
                  placeholder="e.g. DEV-{{sensor_id}}-{{status}}"
                  value={config.template ?? ''}
                  onChange={(e) => {
                    onChange({ template: e.target.value });
                    setCursorPos(e.target.selectionStart || 0);
                    if (showAutocomplete && !e.target.value.includes('{{')) {
                      setShowAutocomplete(false);
                    }
                    requestAnimationFrame(() => {
                      if (overlayRef.current && inputRef.current) {
                        overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
                      }
                    });
                  }}
                  onKeyDown={handleKeyDown}
                  onKeyUp={() => {
                    if (overlayRef.current && inputRef.current) {
                      overlayRef.current.scrollLeft = inputRef.current.scrollLeft;
                    }
                  }}
                  onScroll={(e) => {
                    if (overlayRef.current) {
                      overlayRef.current.scrollLeft = (e.target as HTMLInputElement).scrollLeft;
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowAutocomplete(false);
                    }, 150);
                  }}
                  className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-md border pl-9 pr-3 py-1 bg-[var(--c-bg2)] border-[var(--c-br1)] transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-8 text-[11px] font-mono text-transparent caret-[var(--c-tx1)] relative z-10"
                  autoComplete="off"
                />

                {/* Autocomplete Dropdown */}
                {showAutocomplete && autocompleteOptions.length > 0 && (
                  <div 
                    ref={autocompleteRef}
                    onMouseDown={(e) => e.preventDefault()}
                    className="absolute left-0 right-0 top-full mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl max-h-[140px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--c-br3)]"
                  >
                    {autocompleteOptions.map((opt, i) => (
                      <div
                        key={i}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertOption(opt);
                        }}
                        className={`px-3 py-1.5 cursor-pointer flex items-center justify-between gap-4 transition-colors ${i === selectedIndex ? 'bg-violet-500/20 text-violet-400 font-bold' : 'hover:bg-white/5 text-[var(--c-tx3)]'}`}
                      >
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono">{`{{${opt.name}}}`}</span>
                          <span className="text-[8px] uppercase opacity-50 tracking-wider font-sans">{opt.scope}</span>
                        </div>
                        {opt.scope === 'local' && <span className="text-[8px] px-1 rounded bg-sky-500/10 text-sky-500 border border-sky-500/20">Local</span>}
                        {opt.scope === 'group' && <span className="text-[8px] px-1 rounded bg-violet-500/10 text-violet-500 border border-violet-500/20">Group</span>}
                        {opt.scope === 'global' && <span className="text-[8px] px-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">Global</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <p className="text-[9px] text-[var(--c-tx4)] mt-1">
                Use <code className="bg-[var(--c-bg4)] px-1 py-0.5 rounded text-amber-200/90">{`{{variable_name}}`}</code> to interpolate values from other variables in the same flow.
              </p>

              {/* Validation Badges */}
              {templateVariables.length > 0 && (
                <div data-testid="formula-badges" className="flex flex-wrap gap-1.5 pt-1">
                  {templateVariables.map((v, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border transition-all ${
                        v.isValid
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}
                    >
                      <span>{v.isValid ? '✓' : '✗'}</span>
                      <span>{v.name}</span>
                      <span className="opacity-60 text-[8px]">
                        {v.isValid ? `(${v.scope})` : '(Out of Scope / Not Found)'}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* 5. FORMATTED_MASK */}
          <TabsContent value="FORMATTED_MASK" className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label htmlFor="mask-type">Preset Format Mask</Label>
              <CustomDropdown
                id="mask-type"
                value={config.formattedMaskType ?? 'ALPHANUMERIC'}
                onChange={(val) => onChange({ formattedMaskType: val as StringFormattedMaskType })}
                options={MASK_OPTIONS}
              />
            </div>
            
            {(config.formattedMaskType === 'CUSTOM_MASK' || config.formattedMaskType === 'ALPHANUMERIC') && (
              <div className="space-y-2 p-3 bg-[var(--c-bg4)] border border-[var(--c-br1)] rounded">
                <Label htmlFor="custom-mask" className="flex items-center gap-1"><Code className="w-3 h-3" /> Custom Format Pattern</Label>
                <Input
                  id="custom-mask"
                  type="text"
                  placeholder="e.g. SENSOR-####-XXXX"
                  value={config.customMask ?? ''}
                  onChange={(e) => onChange({ customMask: e.target.value })}
                  className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] font-mono uppercase"
                />
                <p className="text-[9px] text-[var(--c-tx4)] leading-relaxed">
                  <strong className="text-[var(--c-tx2)]">#</strong> = Digit (0-9) &nbsp;&bull;&nbsp; 
                  <strong className="text-[var(--c-tx2)]">X</strong> = Hex (0-F) &nbsp;&bull;&nbsp; 
                  <strong className="text-[var(--c-tx2)]">A</strong> = Letter (A-Z) &nbsp;&bull;&nbsp; 
                  <strong className="text-[var(--c-tx2)]">?</strong> = Alphanumeric
                </p>
                <div className="pt-2">
                   <Label htmlFor="alpha-case" className="mb-1 block text-[9px] uppercase text-[var(--c-tx4)]">Case Formatting</Label>
                   <Select
                     value={config.alphanumericCase ?? 'MIXED'}
                     onValueChange={(val: any) => onChange({ alphanumericCase: val })}
                   >
                     <SelectTrigger className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-7 text-[10px]">
                       <SelectValue placeholder="Mixed Case" />
                     </SelectTrigger>
                     <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                       <SelectItem value="MIXED" className="text-[10px]">Mixed Case</SelectItem>
                       <SelectItem value="UPPER" className="text-[10px]">UPPERCASE</SelectItem>
                       <SelectItem value="LOWER" className="text-[10px]">lowercase</SelectItem>
                     </SelectContent>
                   </Select>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="my-2 border-t border-[var(--c-br1)]" />

      {/* Data Corruption Simulation */}
      <div className="rounded border border-rose-950/40 bg-rose-950/10 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <ShieldAlert className="w-4 h-4" />
            <Label htmlFor="corruption-switch" className="font-medium text-rose-300">Simulate Data Corruption</Label>
          </div>
          <Switch
            id="corruption-switch"
            checked={config.corruptionEnabled ?? false}
            onCheckedChange={(checked) => onChange({ corruptionEnabled: checked })}
            className="data-[state=checked]:bg-rose-500"
          />
        </div>

        {config.corruptionEnabled && (
          <div className="space-y-4 pt-2 border-t border-rose-950/30">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] text-[var(--c-tx4)] uppercase">Anomaly Mode</Label>
                <CustomDropdown
                  value={config.corruptionMode ?? 'MIXED'}
                  onChange={(val) => onChange({ corruptionMode: val as StringCorruptionMode })}
                  options={CORRUPTION_OPTIONS}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[9px] text-[var(--c-tx4)] uppercase">Probability ({(config.corruptionProbability ?? 0.05) * 100}%)</Label>
                <Input
                  type="number"
                  min="0" max="1" step="0.01"
                  value={config.corruptionProbability ?? 0.05}
                  onChange={(e) => onChange({ corruptionProbability: parseFloat(e.target.value) || 0 })}
                  className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[9px] text-[var(--c-tx4)] uppercase">Magnitude (Chars affected/Truncated)</Label>
              <Input
                type="number"
                min="1" max="100"
                value={config.corruptionMagnitude ?? 1}
                onChange={(e) => onChange({ corruptionMagnitude: parseInt(e.target.value) || 1 })}
                className="bg-[var(--c-bg2)] border-[var(--c-br1)] h-8 text-[11px] w-24"
              />
            </div>
            <p className="text-[9px] text-rose-400/80 leading-relaxed">
              When enabled, generated strings will randomly have anomalies injected or parts truncated.
              This is extremely useful to test parser robustness on the receiving backend.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
