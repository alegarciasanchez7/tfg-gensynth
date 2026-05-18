import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../../../context';
import { NumericVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';
import { SequentialGraphEditor } from './SequentialGraphEditor';
import { DistributionGraphEditor } from './DistributionGraphEditor';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../../../ui/tooltip';
import { Info } from 'lucide-react';

interface NumericConfigPanelProps {
  config: NumericVariableConfig;
  onChange: (newConfig: Partial<NumericVariableConfig>) => void;
  flowId?: string;
  groupId?: string;
}

export const NumericConfigPanel: React.FC<NumericConfigPanelProps> = ({ 
  config, 
  onChange,
  flowId,
  groupId,
}) => {
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const precision = config.precision ?? 'FLOAT';
  const pattern = config.pattern ?? 'RANDOM';
  const distributionType = config.distributionType ?? 'UNIFORM';

  // Synchronized local string states to allow natural typing of negative numbers and empty states
  const [minStr, setMinStr] = useState(String(config.min ?? ''));
  const [maxStr, setMaxStr] = useState(String(config.max ?? ''));
  const [initialStr, setInitialStr] = useState(String(config.initialValue ?? ''));
  const [constValueStr, setConstValueStr] = useState(String(config.constantValue ?? ''));
  const [constMarginStr, setConstMarginStr] = useState(String(config.constantMargin ?? ''));
  const [stepStr, setStepStr] = useState(String(config.step ?? ''));
  const [prefixStr, setPrefixStr] = useState(config.prefix ?? '');
  const [suffixStr, setSuffixStr] = useState(config.suffix ?? '');
  const [integerFormatStr, setIntegerFormatStr] = useState(config.integerFormat ?? '');

  // Formula Autocomplete Logic
  const { state } = useApp();
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const formulaValue = config.formula ?? '';

  // Tokenize the formula for inline validation overlay
  const formulaTokens = useMemo(() => {
    const parts: Array<{ text: string; isValid?: boolean; isVariable?: boolean; isConstant?: boolean }> = [];
    const regex = /(\{\{[^}]+\}\})|\b(pi|e)\b/gi;
    let lastIndex = 0;
    let match;
 
    while ((match = regex.exec(formulaValue)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: formulaValue.substring(lastIndex, match.index) });
      }
 
      if (match[1]) {
        // Wrapped in {{ }}
        const rawToken = match[1];
        const varName = rawToken.substring(2, rawToken.length - 2).trim();
        const lowerName = varName.toLowerCase();
        
        if (lowerName === 'pi' || lowerName === 'e') {
          // Wrapped constant (e.g. {{pi}} or {{e}})
          parts.push({
            text: rawToken,
            isConstant: true
          });
        } else {
          // Wrapped variable
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
        }
      } else if (match[2]) {
        // Raw constant literal (e.g. pi or e)
        parts.push({
          text: match[2],
          isConstant: true
        });
      }
      lastIndex = regex.lastIndex;
    }
 
    if (lastIndex < formulaValue.length) {
      parts.push({ text: formulaValue.substring(lastIndex) });
    }
 
    return parts;
  }, [formulaValue, state.variables, flowId, groupId]);
 
  // Extract seen variables to display feedback badges underneath
  const formulaVariables = useMemo(() => {
    const vars: Array<{ name: string; isValid: boolean; scope?: string }> = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    const seen = new Set<string>();
 
    while ((match = regex.exec(formulaValue)) !== null) {
      const varName = match[1].trim();
      const lowerName = varName.toLowerCase();
      if (lowerName === 'pi' || lowerName === 'e') continue;
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
  }, [formulaValue, state.variables, flowId, groupId]);

  const autocompleteOptions = useMemo(() => {
    if (!showAutocomplete || !state.variables) return [];

    const value = inputRef.current ? inputRef.current.value : (config.formula ?? '');
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
      .map(v => ({ name: v.name, scope: v.scope, isConstant: false }));

    // Append math constants!
    const constants = [
      { name: 'pi', scope: 'Math Constant (π)', isConstant: true },
      { name: 'e', scope: 'Math Constant (e)', isConstant: true }
    ];

    const allOptions = [...options, ...constants];

    return allOptions.filter(o => {
      const full = `${o.scope}.${o.name}`.toLowerCase();
      return full.includes(query) || o.name.toLowerCase().includes(query);
    });
  }, [showAutocomplete, config.formula, cursorPos, state.variables, flowId, groupId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteOptions.length]);

  const insertAtCursor = (varName: string) => {
    const ta = inputRef.current;
    if (!ta) return;

    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const value = config.formula ?? '';
    const textBefore = value.substring(0, start);
    
    // Check if we should replace a partially typed {{...
    const lastOpen = textBefore.lastIndexOf('{{');
    let finalStart = start;
    if (lastOpen !== -1 && lastOpen >= textBefore.lastIndexOf('}}')) {
      finalStart = lastOpen;
    }
    
    const replacement = `{{${varName}}}`;
    const newValue = value.substring(0, finalStart) + replacement + value.substring(end);
    
    onChange({ formula: newValue });
    
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const newPos = finalStart + replacement.length;
        ta.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const insertOption = (opt: { name: string; scope: string; isConstant?: boolean }) => {
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
      const value = inputRef.current ? inputRef.current.value : (config.formula ?? '');
      const textBefore = value.substring(0, start);
      if (textBefore.endsWith('{')) {
        setShowAutocomplete(true);
        setCursorPos(start + 1);
      }
    }
  };

  // Sync state if props change externally
  useEffect(() => {
    if (config.min !== undefined && parseFloat(minStr) !== config.min) setMinStr(String(config.min));
  }, [config.min]);

  useEffect(() => {
    if (config.max !== undefined && parseFloat(maxStr) !== config.max) setMaxStr(String(config.max));
  }, [config.max]);

  useEffect(() => {
    if (config.initialValue !== undefined && parseFloat(initialStr) !== config.initialValue) setInitialStr(String(config.initialValue));
  }, [config.initialValue]);

  useEffect(() => {
    if (config.constantValue !== undefined && parseFloat(constValueStr) !== config.constantValue) setConstValueStr(String(config.constantValue));
  }, [config.constantValue]);

  useEffect(() => {
    if (config.constantMargin !== undefined && parseFloat(constMarginStr) !== config.constantMargin) setConstMarginStr(String(config.constantMargin));
  }, [config.constantMargin]);

  useEffect(() => {
    if (config.step !== undefined && parseFloat(stepStr) !== config.step) setStepStr(String(config.step));
  }, [config.step]);

  useEffect(() => {
    if (config.prefix !== undefined && config.prefix !== prefixStr) setPrefixStr(config.prefix ?? '');
  }, [config.prefix]);

  useEffect(() => {
    if (config.suffix !== undefined && config.suffix !== suffixStr) setSuffixStr(config.suffix ?? '');
  }, [config.suffix]);

  useEffect(() => {
    if (config.integerFormat !== undefined && config.integerFormat !== integerFormatStr) setIntegerFormatStr(config.integerFormat ?? '');
  }, [config.integerFormat]);

  const handlePatternChange = (newPattern: any) => {
    const updates: Partial<NumericVariableConfig> = { pattern: newPattern };

    if (newPattern === 'SEQUENTIAL' && (!config.sequentialGraph || config.sequentialGraph.length === 0)) {
      updates.sequentialGraph = [];
    }
    if (newPattern === 'DISTRIBUTION' && (!config.customDistributionGraph || config.customDistributionGraph.length === 0)) {
      updates.customDistributionGraph = [];
    }
    onChange(updates);
  };

  // Safe handler helpers to permit freeform typing (like minus sign) and push parsed float on the fly
  const handleNumericChange = (
    value: string,
    setter: (s: string) => void,
    field: keyof NumericVariableConfig
  ) => {
    setter(value);
    if (value === '' || value === '-') return;
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      onChange({ [field]: parsed });
    }
  };

  const handleNumericBlur = (
    value: string,
    setter: (s: string) => void,
    field: keyof NumericVariableConfig,
    fallback: number
  ) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      setter(String(fallback));
      onChange({ [field]: fallback });
    } else {
      setter(String(parsed));
      onChange({ [field]: parsed });
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {pattern !== 'CONSTANT' && (
          <>
            {/* 1. Range Config */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="numeric-min" className="text-[10px] uppercase text-[var(--c-tx4)]">Minimum</Label>
                <Input
                  id="numeric-min"
                  type="text"
                  data-testid="numeric-min-input"
                  value={minStr}
                  onChange={(e) => handleNumericChange(e.target.value, setMinStr, 'min')}
                  onBlur={(e) => handleNumericBlur(e.target.value, setMinStr, 'min', 0)}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. -50"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="numeric-max" className="text-[10px] uppercase text-[var(--c-tx4)]">Maximum</Label>
                <Input
                  id="numeric-max"
                  type="text"
                  data-testid="numeric-max-input"
                  value={maxStr}
                  onChange={(e) => handleNumericChange(e.target.value, setMaxStr, 'max')}
                  onBlur={(e) => handleNumericBlur(e.target.value, setMaxStr, 'max', 100)}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. 100"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="numeric-initial" className="text-[10px] uppercase text-[var(--c-tx4)]">Initial Value</Label>
                <Input
                  id="numeric-initial"
                  type="text"
                  data-testid="numeric-initial-input"
                  value={initialStr}
                  onChange={(e) => handleNumericChange(e.target.value, setInitialStr, 'initialValue')}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    const clamped = isNaN(val) ? min : Math.max(min, Math.min(max, val));
                    setInitialStr(String(clamped));
                    onChange({ initialValue: clamped });
                  }}
                  className="h-8 text-xs font-mono"
                  placeholder="e.g. 0"
                />
              </div>
            </div>

            {/* 2. Precision & Decimal Selector */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="numeric-precision" className="text-[10px] uppercase text-[var(--c-tx4)]">Precision</Label>
                <Select
                  value={precision === 'DOUBLE' ? 'FLOAT' : precision}
                  onValueChange={(val: any) => onChange({ precision: val })}
                >
                  <SelectTrigger id="numeric-precision" data-testid="numeric-precision-trigger" className="h-8 text-xs">
                    <SelectValue placeholder="Select precision" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTEGER">Integer</SelectItem>
                    <SelectItem value="FLOAT">Float</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {precision !== 'INTEGER' && (
                <div className="space-y-1">
                  <Label htmlFor="numeric-decimals" className="text-[10px] uppercase text-[var(--c-tx4)]">Decimal Places</Label>
                  <Input
                    id="numeric-decimals"
                    type="number"
                    min={0}
                    max={10}
                    value={config.decimalPlaces ?? 2}
                    onChange={(e) => onChange({ decimalPlaces: Math.max(0, Math.min(10, parseInt(e.target.value) || 0)) })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* 3. Prefix, Padding & Suffix Format (Common to Float and Integer) */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">
              Display Format (Prefix, Padding & Suffix)
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
                <p>{"Format the generated numeric values visually:"}</p>
                <p>{"• Prefix: Prepended text (e.g. '$ ' or 'USD ')."}</p>
                <p>{"• Padding: Zero-padding length (e.g. '001' formats 5 to '005')."}</p>
                <p>{"• Suffix: Appended text (e.g. ' kg' or ' / hour')."}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="numeric-prefix" className="text-[9px] text-[var(--c-tx4)]">Prefix</Label>
              <Input
                id="numeric-prefix"
                type="text"
                placeholder="e.g. $"
                value={prefixStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setPrefixStr(val);
                  onChange({ prefix: val });
                }}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="numeric-int-format" className="text-[9px] text-[var(--c-tx4)]">Padding</Label>
              <Input
                id="numeric-int-format"
                type="text"
                placeholder="e.g. 001"
                value={integerFormatStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setIntegerFormatStr(val);
                  onChange({ integerFormat: val });
                }}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="numeric-suffix" className="text-[9px] text-[var(--c-tx4)]">Suffix</Label>
              <Input
                id="numeric-suffix"
                type="text"
                placeholder="e.g. kg"
                value={suffixStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setSuffixStr(val);
                  onChange({ suffix: val });
                }}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* 4. Main Pattern Selector */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="numeric-pattern" className="text-[10px] uppercase text-[var(--c-tx4)]">Generation Pattern</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] space-y-1 text-[11px]">
                <div><strong>Random</strong>: Snaps to customizable steps.</div>
                <div><strong>Constant</strong>: Fixed value with optional oscillation margins.</div>
                <div><strong>Sequential</strong>: Loops over a custom visual curve.</div>
                <div><strong>Distribution</strong>: Standard or custom weighted probability curves.</div>
              </TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={pattern}
            onValueChange={handlePatternChange}
          >
            <SelectTrigger id="numeric-pattern" data-testid="numeric-pattern-trigger" className="h-8 text-xs">
              <SelectValue placeholder="Select pattern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RANDOM">Random</SelectItem>
              <SelectItem value="CONSTANT">Constant</SelectItem>
              <SelectItem value="SEQUENTIAL">Sequential</SelectItem>
              <SelectItem value="DISTRIBUTION">Distribution</SelectItem>
              <SelectItem value="FORMULA">Formula</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 5. Conditional Sub-panels */}
        <div className="mt-2 rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-3 space-y-3">
          {pattern === 'RANDOM' && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="numeric-step" className="text-[10px] uppercase text-[var(--c-tx4)]">Step size difference</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={10} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px]">
                    Forces generated values to snap to multiples of the step (e.g. step = 5 will output 5, 10, 15...). Supports positive and negative steps.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="numeric-step"
                type="text"
                placeholder="e.g. 1.0 or -0.5 (set 0 to disable)"
                value={stepStr}
                onChange={(e) => handleNumericChange(e.target.value, setStepStr, 'step')}
                onBlur={(e) => handleNumericBlur(e.target.value, setStepStr, 'step', 0)}
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {pattern === 'CONSTANT' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="numeric-const-val" className="text-[10px] uppercase text-[var(--c-tx4)]">Constant Value</Label>
                <Input
                  id="numeric-const-val"
                  type="text"
                  value={constValueStr}
                  onChange={(e) => handleNumericChange(e.target.value, setConstValueStr, 'constantValue')}
                  onBlur={(e) => handleNumericBlur(e.target.value, setConstValueStr, 'constantValue', (min + (max - min) / 2))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="numeric-const-margin" className="text-[10px] uppercase text-[var(--c-tx4)]">Oscillation Margin (+/-)</Label>
                <Input
                  id="numeric-const-margin"
                  type="text"
                  placeholder="e.g. 2.5 (0 = pure constant)"
                  value={constMarginStr}
                  onChange={(e) => handleNumericChange(e.target.value, setConstMarginStr, 'constantMargin')}
                  onBlur={(e) => {
                    const val = Math.abs(parseFloat(e.target.value) || 0);
                    setConstMarginStr(String(val));
                    onChange({ constantMargin: val });
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {pattern === 'SEQUENTIAL' && (
            <SequentialGraphEditor
              min={min}
              max={max}
              points={config.sequentialGraph || []}
              onChange={(points) => onChange({ sequentialGraph: points })}
            />
          )}

          {pattern === 'DISTRIBUTION' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="numeric-dist-type" className="text-[10px] uppercase text-[var(--c-tx4)]">Probability Distribution</Label>
                <Select
                  value={distributionType}
                  onValueChange={(val: any) => onChange({ distributionType: val })}
                >
                  <SelectTrigger id="numeric-dist-type" className="h-8 text-xs">
                    <SelectValue placeholder="Select distribution" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNIFORM">Uniform</SelectItem>
                    <SelectItem value="NORMAL">Normal / Gaussian</SelectItem>
                    <SelectItem value="EXPONENTIAL">Exponential</SelectItem>
                    <SelectItem value="CUSTOM">Custom Weighted Equalizer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {distributionType === 'CUSTOM' && (
                <DistributionGraphEditor
                  min={min}
                  max={max}
                  points={config.customDistributionGraph || []}
                  onChange={(points) => onChange({ customDistributionGraph: points })}
                  boundaryMode={config.boundaryMode || 'RIGHT'}
                  onBoundaryModeChange={(mode) => onChange({ boundaryMode: mode })}
                />
              )}
            </div>
          )}

          {pattern === 'FORMULA' && (
            <div className="space-y-1 relative">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="numeric-formula" className="text-[10px] uppercase text-[var(--c-tx4)]">Formula Configuration</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                      <Info size={10} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[320px] space-y-1.5 p-3 text-[11px] leading-relaxed">
                    <p>{"Apply dynamic mathematical formulas using variables and constants."}</p>
                    <div className="space-y-1 text-[10px] opacity-90 font-sans border-t border-white/10 pt-1.5 pb-1">
                      <p>{"• Type '{{' to search and autocomplete valid variables or built-in math constants."}</p>
                      <p>{"• Variables in green are valid and in scope; red indicates invalid or out-of-scope references."}</p>
                      <p>{"• Built-in mathematical constants like pi and e are highlighted in amber."}</p>
                    </div>
                    <div className="text-[10px] bg-white/5 rounded p-1.5 border border-white/10 font-mono text-[var(--c-tx3)]">
                      <span className="text-[8px] uppercase font-sans text-[var(--c-tx4)] block mb-0.5">Example:</span>
                      {"sin("}
                      <span className="text-emerald-400 font-semibold">{"{{angle}}"}</span>
                      {" * "}
                      <span className="text-amber-400 font-semibold">{"pi"}</span>
                      {" / 180) + "}
                      <span className="text-amber-400 font-semibold">{"e"}</span>
                      {" ^ "}
                      <span className="text-emerald-400 font-semibold">{"{{scale}}"}</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="relative">
                {/* Highlighting Overlay */}
                <div 
                  ref={overlayRef}
                  className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none whitespace-pre overflow-hidden flex items-center px-3 bg-transparent text-transparent text-xs font-mono border border-transparent h-8"
                >
                  {formulaTokens.map((t, i) => {
                    if (t.isConstant) {
                      return (
                        <span 
                          key={i} 
                          className="bg-amber-500/20 text-amber-400 rounded ring-1 ring-inset ring-amber-500/40 px-0.5 -mx-0.5 font-semibold"
                        >
                          {t.text}
                        </span>
                      );
                    }
                    return (
                      <span 
                        key={i} 
                        className={t.isVariable ? (t.isValid ? 'bg-emerald-500/20 text-emerald-400 rounded ring-1 ring-inset ring-emerald-500/40 px-0.5 -mx-0.5' : 'bg-red-500/20 text-red-400 rounded ring-1 ring-inset ring-red-500/40 px-0.5 -mx-0.5') : 'text-[var(--c-tx2)]'}
                      >
                        {t.text}
                      </span>
                    );
                  })}
                </div>

                <input
                  ref={inputRef}
                  id="numeric-formula"
                  type="text"
                  data-testid="numeric-formula-input"
                  placeholder="e.g. {{temperature}} * 1.5 + 10"
                  value={config.formula ?? ''}
                  onChange={(e) => {
                    onChange({ formula: e.target.value });
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
                  className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-md border px-3 py-1 bg-input-background transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-8 text-xs font-mono text-transparent caret-[var(--c-tx1)] relative z-10"
                  autoComplete="off"
                />

                {/* Autocomplete Dropdown */}
                {showAutocomplete && autocompleteOptions.length > 0 && (
                  <div 
                    ref={autocompleteRef}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur when clicking scrollbar or container area
                    className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl max-h-[140px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--c-br3)]"
                  >
                    {autocompleteOptions.map((opt, i) => (
                      <div
                        key={i}
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent blur
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
                        {opt.isConstant && <span className="text-[8px] px-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold">Constant</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Premium Variable Validation Feedback Badges */}
              {formulaVariables.length > 0 && (
                <div data-testid="formula-badges" className="flex flex-wrap gap-1.5 pt-1">
                  {formulaVariables.map((v, idx) => (
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
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
