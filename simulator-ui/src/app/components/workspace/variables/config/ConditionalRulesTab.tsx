import React, { useState, useRef, useEffect } from 'react';
import { 
  ConditionalRule, 
  Variable, 
  NumericVariableConfig, 
  StringVariableConfig, 
  ListVariableConfig, 
  TemporalVariableConfig, 
  PointVariableConfig, 
  BooleanVariableConfig 
} from '../../../../types';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select';
import { Trash2, Plus } from 'lucide-react';
import { useApp } from '../../../../context';
import { NumericConfigPanel } from './NumericConfigPanel';
import { StringConfigPanel } from './StringConfigPanel';
import { ListConfigPanel } from './ListConfigPanel';
import { TemporalConfigPanel } from './TemporalConfigPanel';
import { PointConfigPanel } from './PointConfigPanel';
import { BooleanConfigPanel } from './BooleanConfigPanel';

interface ConditionalRulesTabProps {
  rules: ConditionalRule[];
  onChange: (rules: ConditionalRule[]) => void;
  variableType: Variable['type'];
  flowId?: string;
  groupId?: string;
}

export const ConditionalRulesTab: React.FC<ConditionalRulesTabProps> = ({ 
  rules, 
  onChange,
  variableType,
  flowId,
  groupId
}) => {
  const { state } = useApp();
  const [showSuggestions, setShowSuggestions] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Get all unique variable names from state
  const allVariables = React.useMemo(() => {
    // For now, let's assume we have a list of variables in state
    // In a real scenario, we'd pull from state.variables if it existed or aggregate from flows
    return state.variables?.map(v => v.name) || [];
  }, [state.variables]);

  const filteredVars = allVariables.filter(v => v.toLowerCase().includes(filter.toLowerCase()));

  const handleAddRule = () => {
    onChange([
      ...rules,
      { targetVariable: '', operator: 'EQUALS', value: '', overrides: {} }
    ]);
  };

  const handleRemoveRule = (index: number) => {
    const newRules = [...rules];
    newRules.splice(index, 1);
    onChange(newRules);
  };

  const handleUpdateRule = (index: number, field: keyof ConditionalRule, val: any) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], [field]: val };
    onChange(newRules);
  };

  const handleOverrideChange = (index: number, newOverrides: Partial<any>) => {
    const newRules = [...rules];
    const currentOverrides = typeof newRules[index].overrides === 'object' && newRules[index].overrides !== null 
      ? newRules[index].overrides 
      : {};
    newRules[index] = {
      ...newRules[index],
      overrides: { ...currentOverrides, ...newOverrides }
    };
    onChange(newRules);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderOverrideVisualEditor = (rule: ConditionalRule, idx: number) => {
    const cfg = typeof rule.overrides === 'object' && rule.overrides !== null ? rule.overrides : {};
    
    switch (variableType) {
      case 'numeric':
        return (
          <NumericConfigPanel
            config={cfg as NumericVariableConfig}
            onChange={(newCfg) => handleOverrideChange(idx, newCfg)}
            flowId={flowId}
            groupId={groupId}
          />
        );
      case 'string':
        return (
          <StringConfigPanel
            config={cfg as StringVariableConfig}
            onChange={(newCfg) => handleOverrideChange(idx, newCfg)}
          />
        );
      case 'list':
        return (
          <ListConfigPanel
            config={cfg as ListVariableConfig}
            onChange={(newCfg) => handleOverrideChange(idx, newCfg)}
          />
        );
      case 'temporal':
        return (
          <TemporalConfigPanel
            config={cfg as TemporalVariableConfig}
            onChange={(newCfg) => handleOverrideChange(idx, newCfg)}
          />
        );
      case 'point':
        return (
          <PointConfigPanel
            config={cfg as PointVariableConfig}
            onChange={(newCfg) => handleOverrideChange(idx, newCfg)}
          />
        );
      case 'boolean':
        return (
          <BooleanConfigPanel
            config={cfg as BooleanVariableConfig}
            onChange={(newCfg) => handleOverrideChange(idx, newCfg)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--c-tx3)] font-medium">Conditional Rules</h3>
        <Button variant="outline" size="sm" onClick={handleAddRule} className="h-7 text-[10px] bg-[var(--c-bg3)] border-[var(--c-br1)]">
          <Plus className="w-3 h-3 mr-1" />
          Add Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-[10px] text-[var(--c-tx4)] italic py-4 text-center bg-[var(--c-bg3)]/50 rounded border border-dashed border-[var(--c-br1)]">
          No conditional rules defined.
        </p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div key={idx} className="p-3 border border-[var(--c-br1)] rounded bg-[var(--c-bg3)]/30 space-y-3 relative">
              <div className="flex justify-between items-start">
                <span className="text-[9px] font-bold text-[var(--c-tx4)] uppercase tracking-tighter">Rule #{idx + 1}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-red-500/10" onClick={() => handleRemoveRule(idx)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500/70" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="relative">
                  <Input
                    placeholder="Variable"
                    value={rule.targetVariable}
                    onFocus={() => {
                      setShowSuggestions(idx);
                      setFilter(rule.targetVariable);
                    }}
                    onChange={(e) => {
                      handleUpdateRule(idx, 'targetVariable', e.target.value);
                      setFilter(e.target.value);
                      setShowSuggestions(idx);
                    }}
                    className="h-7 text-[11px] bg-[var(--c-bg2)] border-[var(--c-br1)] font-mono"
                  />
                  {showSuggestions === idx && filteredVars.length > 0 && (
                    <div 
                      ref={suggestionsRef}
                      className="absolute z-50 mt-1 w-full max-h-32 overflow-y-auto bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-lg"
                    >
                      {filteredVars.map(v => (
                        <div
                          key={v}
                          className="px-2 py-1.5 text-[10px] font-mono hover:bg-[var(--c-bg4)] cursor-pointer text-[var(--c-tx2)]"
                          onClick={() => {
                            handleUpdateRule(idx, 'targetVariable', v);
                            setShowSuggestions(null);
                          }}
                        >
                          {v}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <Select
                  value={rule.operator}
                  onValueChange={(val: any) => handleUpdateRule(idx, 'operator', val)}
                >
                  <SelectTrigger className="h-7 text-[10px] bg-[var(--c-bg2)] border-[var(--c-br1)] uppercase font-medium">
                    <SelectValue placeholder="Op" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--c-bg2)] border-[var(--c-br1)]">
                    <SelectItem value="EQUALS" className="text-[10px]">EQUALS</SelectItem>
                    <SelectItem value="NOT_EQUALS" className="text-[10px]">NOT EQUALS</SelectItem>
                    <SelectItem value="GREATER_THAN" className="text-[10px]">GREATER THAN</SelectItem>
                    <SelectItem value="LESS_THAN" className="text-[10px]">LESS THAN</SelectItem>
                    <SelectItem value="CONTAINS" className="text-[10px]">CONTAINS</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Value"
                  value={rule.value}
                  onChange={(e) => handleUpdateRule(idx, 'value', e.target.value)}
                  className="h-7 text-[11px] bg-[var(--c-bg2)] border-[var(--c-br1)] font-mono"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--c-tx4)] font-semibold">Overrides Configuration</span>
                <div className="p-3 border rounded border-[var(--c-br1)] bg-[var(--c-bg2)]">
                  {renderOverrideVisualEditor(rule, idx)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
