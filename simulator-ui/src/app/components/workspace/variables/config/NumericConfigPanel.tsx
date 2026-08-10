import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../../../context';
import { NumericVariableConfig } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
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

interface CustomDropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ value, onChange, options, id }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-input-background dark:bg-input/30 dark:hover:bg-input/50 px-3 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
      >
        <span>{selectedOption.label}</span>
        <svg
          className={`size-3.5 opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--c-br3)]">
          <div className="p-1 space-y-0.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
                  opt.value === value
                    ? 'bg-violet-500/20 text-violet-400 font-semibold'
                    : 'hover:bg-white/5 text-[var(--c-tx2)]'
                }`}
              >
                <span>{opt.label}</span>
                {opt.value === value && (
                  <svg
                    className="size-3.5 text-violet-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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

  // New fields local string states
  const [sineFreqStr, setSineFreqStr] = useState(String(config.sineFrequency ?? 1.0));
  const [sineAmpStr, setSineAmpStr] = useState(String(config.sineAmplitude ?? 10.0));
  const [sinePhaseStr, setSinePhaseStr] = useState(String(config.sinePhase ?? 0.0));
  const [sineOffsetStr, setSineOffsetStr] = useState(String(config.sineOffset ?? 0.0));

  const [driftRateStr, setDriftRateStr] = useState(String(config.driftRate ?? 0.5));
  const [driftInitialStr, setDriftInitialStr] = useState(config.driftInitialValue !== undefined && config.driftInitialValue !== null ? String(config.driftInitialValue) : '');

  const [timeStepStr, setTimeStepStr] = useState(String(config.simulationTimeStep ?? 1.0));

  const [noiseAmpStr, setNoiseAmpStr] = useState(String(config.noiseAmplitude ?? 1.0));
  const [noiseStdDevStr, setNoiseStdDevStr] = useState(String(config.noiseStdDev ?? 1.0));

  const [spikeProbStr, setSpikeProbStr] = useState(String(config.spikeProbability !== undefined ? (config.spikeProbability > 1 ? config.spikeProbability : config.spikeProbability * 100) : 5));
  const [spikeMagStr, setSpikeMagStr] = useState(String(config.spikeMagnitude ?? 50.0));
  const [spikeMinStr, setSpikeMinStr] = useState(String(config.spikeMin ?? 100.0));
  const [spikeMaxStr, setSpikeMaxStr] = useState(String(config.spikeMax ?? 200.0));
  const [spikeMultStr, setSpikeMultStr] = useState(String(config.spikeMultiplier ?? 2.0));

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
                <CustomDropdown
                  id="numeric-precision"
                  value={precision === 'DOUBLE' ? 'FLOAT' : precision}
                  onChange={(val) => onChange({ precision: val as any })}
                  options={[
                    { value: 'INTEGER', label: 'Integer' },
                    { value: 'FLOAT', label: 'Float' }
                  ]}
                />
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
          <CustomDropdown
            id="numeric-pattern"
            value={pattern}
            onChange={(val) => handlePatternChange(val as any)}
            options={[
              { value: 'RANDOM', label: 'Random' },
              { value: 'CONSTANT', label: 'Constant' },
              { value: 'SEQUENTIAL', label: 'Sequential' },
              { value: 'DISTRIBUTION', label: 'Distribution' },
              { value: 'FORMULA', label: 'Formula' },
              { value: 'SINUSOIDAL', label: 'Sinusoidal Wave' },
              { value: 'DRIFT', label: 'Linear Drift' }
            ]}
          />
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
                <CustomDropdown
                  id="numeric-dist-type"
                  value={distributionType}
                  onChange={(val) => onChange({ distributionType: val as any })}
                  options={[
                    { value: 'UNIFORM', label: 'Uniform' },
                    { value: 'NORMAL', label: 'Normal / Gaussian' },
                    { value: 'EXPONENTIAL', label: 'Exponential' },
                    { value: 'CUSTOM', label: 'Custom Weighted Equalizer' }
                  ]}
                />
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

          {pattern === 'SINUSOIDAL' && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1.5">
                <span>Sinusoidal / Periodic Wave</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sine-freq" className="text-[10px] uppercase text-[var(--c-tx4)]">Frequency (Hz)</Label>
                  <Input
                    id="sine-freq"
                    type="text"
                    placeholder="e.g. 1.0"
                    value={sineFreqStr}
                    onChange={(e) => handleNumericChange(e.target.value, setSineFreqStr, 'sineFrequency')}
                    onBlur={(e) => handleNumericBlur(e.target.value, setSineFreqStr, 'sineFrequency', 1.0)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sine-amp" className="text-[10px] uppercase text-[var(--c-tx4)]">Amplitude</Label>
                  <Input
                    id="sine-amp"
                    type="text"
                    placeholder="e.g. 10.0"
                    value={sineAmpStr}
                    onChange={(e) => handleNumericChange(e.target.value, setSineAmpStr, 'sineAmplitude')}
                    onBlur={(e) => handleNumericBlur(e.target.value, setSineAmpStr, 'sineAmplitude', 10.0)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sine-phase" className="text-[10px] uppercase text-[var(--c-tx4)]">Phase Shift (rad)</Label>
                  <Input
                    id="sine-phase"
                    type="text"
                    placeholder="e.g. 0.0"
                    value={sinePhaseStr}
                    onChange={(e) => handleNumericChange(e.target.value, setSinePhaseStr, 'sinePhase')}
                    onBlur={(e) => handleNumericBlur(e.target.value, setSinePhaseStr, 'sinePhase', 0.0)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sine-offset" className="text-[10px] uppercase text-[var(--c-tx4)]">DC Offset Level</Label>
                  <Input
                    id="sine-offset"
                    type="text"
                    placeholder="e.g. 0.0"
                    value={sineOffsetStr}
                    onChange={(e) => handleNumericChange(e.target.value, setSineOffsetStr, 'sineOffset')}
                    onBlur={(e) => handleNumericBlur(e.target.value, setSineOffsetStr, 'sineOffset', 0.0)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {pattern === 'DRIFT' && (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                <span>Linear Drift</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="drift-rate" className="text-[10px] uppercase text-[var(--c-tx4)]">Drift Rate (units/s)</Label>
                  <Input
                    id="drift-rate"
                    type="text"
                    placeholder="e.g. 0.5"
                    value={driftRateStr}
                    onChange={(e) => handleNumericChange(e.target.value, setDriftRateStr, 'driftRate')}
                    onBlur={(e) => handleNumericBlur(e.target.value, setDriftRateStr, 'driftRate', 0.5)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="drift-initial" className="text-[10px] uppercase text-[var(--c-tx4)]">Initial Value</Label>
                  <Input
                    id="drift-initial"
                    type="text"
                    placeholder="Optional start"
                    value={driftInitialStr}
                    onChange={(e) => {
                      setDriftInitialStr(e.target.value);
                      if (e.target.value === '' || e.target.value === '-') return;
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed)) onChange({ driftInitialValue: parsed });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="drift-limit-mode" className="text-[10px] uppercase text-[var(--c-tx4)]">Boundary Collision Mode</Label>
                <CustomDropdown
                  id="drift-limit-mode"
                  value={config.driftLimitMode ?? 'CLAMP'}
                  onChange={(val) => onChange({ driftLimitMode: val as any })}
                  options={[
                    { value: 'CLAMP', label: 'CLAMP (Freeze at min/max limit)' },
                    { value: 'WRAP', label: 'WRAP / RESET (Reset to opposite extreme)' },
                    { value: 'BOUNCE', label: 'BOUNCE (Invert direction on collision)' }
                  ]}
                />
              </div>
            </div>
          )}
        </div>

        {/* 6. Virtual Simulation Clock */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="numeric-timestep" className="text-[10px] uppercase text-[var(--c-tx4)]">Virtual Clock Delta (seconds / tick)</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors">
                  <Info size={10} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-[11px]">
                Virtual seconds simulated per tick. Allows high-speed relative time simulation while preserving wave frequencies and drift slopes.
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            id="numeric-timestep"
            type="text"
            placeholder="e.g. 1.0"
            value={timeStepStr}
            onChange={(e) => handleNumericChange(e.target.value, setTimeStepStr, 'simulationTimeStep')}
            onBlur={(e) => handleNumericBlur(e.target.value, setTimeStepStr, 'simulationTimeStep', 1.0)}
            className="h-8 text-xs font-mono"
          />
        </div>

        {/* 7. Realistic Noise Modifier Layer */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--c-tx1)]">Noise Injection (Jitter / Gaussian)</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Modifier Layer</span>
            </div>
            <button
              type="button"
              onClick={() => onChange({ noiseEnabled: !config.noiseEnabled })}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                config.noiseEnabled
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'bg-white/5 text-[var(--c-tx4)] border border-white/10 hover:bg-white/10'
              }`}
            >
              {config.noiseEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {config.noiseEnabled && (
            <div className="space-y-3 pt-2 border-t border-[var(--c-br1)]">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="noise-type" className="text-[10px] uppercase text-[var(--c-tx4)]">Noise Type</Label>
                  <CustomDropdown
                    id="noise-type"
                    value={config.noiseType ?? 'GAUSSIAN'}
                    onChange={(val) => onChange({ noiseType: val as any })}
                    options={[
                      { value: 'GAUSSIAN', label: 'Gaussian Noise (N(0, σ²))' },
                      { value: 'UNIFORM', label: 'Uniform Jitter (± Noise)' }
                    ]}
                  />
                </div>
                {config.noiseType === 'UNIFORM' ? (
                  <div className="space-y-1">
                    <Label htmlFor="noise-amp" className="text-[10px] uppercase text-[var(--c-tx4)]">Jitter Amplitude (±)</Label>
                    <Input
                      id="noise-amp"
                      type="text"
                      placeholder="e.g. 1.0"
                      value={noiseAmpStr}
                      onChange={(e) => handleNumericChange(e.target.value, setNoiseAmpStr, 'noiseAmplitude')}
                      onBlur={(e) => handleNumericBlur(e.target.value, setNoiseAmpStr, 'noiseAmplitude', 1.0)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label htmlFor="noise-stddev" className="text-[10px] uppercase text-[var(--c-tx4)]">Standard Deviation (σ)</Label>
                    <Input
                      id="noise-stddev"
                      type="text"
                      placeholder="e.g. 1.0"
                      value={noiseStdDevStr}
                      onChange={(e) => handleNumericChange(e.target.value, setNoiseStdDevStr, 'noiseStdDev')}
                      onBlur={(e) => handleNumericBlur(e.target.value, setNoiseStdDevStr, 'noiseStdDev', 1.0)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 8. Spike Anomaly Modifier Layer */}
        <div className="rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--c-tx1)]">Anomaly Injection / Spikes</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Out-of-range Spikes</span>
            </div>
            <button
              type="button"
              onClick={() => onChange({ spikeEnabled: !config.spikeEnabled })}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                config.spikeEnabled
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-white/5 text-[var(--c-tx4)] border border-white/10 hover:bg-white/10'
              }`}
            >
              {config.spikeEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {config.spikeEnabled && (
            <div className="space-y-3 pt-2 border-t border-[var(--c-br1)]">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="spike-prob" className="text-[10px] uppercase text-[var(--c-tx4)]">Spike Probability (Pspike %)</Label>
                  <Input
                    id="spike-prob"
                    type="text"
                    placeholder="e.g. 5 (5%)"
                    value={spikeProbStr}
                    onChange={(e) => {
                      setSpikeProbStr(e.target.value);
                      if (e.target.value === '' || e.target.value === '-') return;
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed)) {
                        onChange({ spikeProbability: parsed > 1 ? parsed / 100.0 : parsed });
                      }
                    }}
                    onBlur={(e) => {
                      const parsed = parseFloat(e.target.value);
                      const valid = isNaN(parsed) ? 5 : Math.max(0, Math.min(100, parsed));
                      setSpikeProbStr(String(valid));
                      onChange({ spikeProbability: valid / 100.0 });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="spike-mode" className="text-[10px] uppercase text-[var(--c-tx4)]">Spike Mode</Label>
                  <CustomDropdown
                    id="spike-mode"
                    value={config.spikeMode ?? 'FIXED_OFFSET'}
                    onChange={(val) => onChange({ spikeMode: val as any })}
                    options={[
                      { value: 'FIXED_OFFSET', label: 'Fixed Offset (± Mag)' },
                      { value: 'RANGE_SPIKE', label: 'Critical Range (Min..Max)' },
                      { value: 'MULTIPLIER', label: 'Multiplier (Base × K)' }
                    ]}
                  />
                </div>
              </div>

              {config.spikeMode === 'RANGE_SPIKE' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="spike-min" className="text-[10px] uppercase text-[var(--c-tx4)]">Min Spike Value</Label>
                    <Input
                      id="spike-min"
                      type="text"
                      placeholder="e.g. 100.0"
                      value={spikeMinStr}
                      onChange={(e) => handleNumericChange(e.target.value, setSpikeMinStr, 'spikeMin')}
                      onBlur={(e) => handleNumericBlur(e.target.value, setSpikeMinStr, 'spikeMin', 100.0)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="spike-max" className="text-[10px] uppercase text-[var(--c-tx4)]">Max Spike Value</Label>
                    <Input
                      id="spike-max"
                      type="text"
                      placeholder="e.g. 200.0"
                      value={spikeMaxStr}
                      onChange={(e) => handleNumericChange(e.target.value, setSpikeMaxStr, 'spikeMax')}
                      onBlur={(e) => handleNumericBlur(e.target.value, setSpikeMaxStr, 'spikeMax', 200.0)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              ) : config.spikeMode === 'MULTIPLIER' ? (
                <div className="space-y-1">
                  <Label htmlFor="spike-mult" className="text-[10px] uppercase text-[var(--c-tx4)]">Multiplier Factor (K)</Label>
                  <Input
                    id="spike-mult"
                    type="text"
                    placeholder="e.g. 2.5"
                    value={spikeMultStr}
                    onChange={(e) => handleNumericChange(e.target.value, setSpikeMultStr, 'spikeMultiplier')}
                    onBlur={(e) => handleNumericBlur(e.target.value, setSpikeMultStr, 'spikeMultiplier', 2.0)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="spike-mag" className="text-[10px] uppercase text-[var(--c-tx4)]">Offset Magnitude (±)</Label>
                  <Input
                    id="spike-mag"
                    type="text"
                    placeholder="e.g. 50.0"
                    value={spikeMagStr}
                    onChange={(e) => handleNumericChange(e.target.value, setSpikeMagStr, 'spikeMagnitude')}
                    onBlur={(e) => handleNumericBlur(e.target.value, setSpikeMagStr, 'spikeMagnitude', 50.0)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
