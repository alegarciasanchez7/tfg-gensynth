import React, { useState } from 'react';
import { ListVariableConfig, ListItemConfig, ListSelectionStrategy, VariableType } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { CustomDropdown } from '../../../ui/custom-dropdown';
import { Trash2, Plus, Info, Layers, RefreshCw } from 'lucide-react';
import { NumericConfigPanel } from './NumericConfigPanel';
import { StringConfigPanel } from './StringConfigPanel';
import { BooleanConfigPanel } from './BooleanConfigPanel';
import { TemporalConfigPanel } from './TemporalConfigPanel';

interface ListConfigPanelProps {
  config: ListVariableConfig;
  onChange: (newConfig: Partial<ListVariableConfig>) => void;
  flowId?: string;
  groupId?: string;
  nestingLevel?: number;
}

const STRATEGY_OPTIONS = [
  { value: 'WEIGHTED_RANDOM', label: 'Weighted Random (Probabilistic)' },
  { value: 'SEQUENTIAL', label: 'Sequential (Round-Robin)' },
  { value: 'SHUFFLE', label: 'Shuffle (No repeat until exhausted)' },
  { value: 'MARKOV_CHAIN', label: 'Markov Chain (State Transition Matrix)' },
];

const EMBEDDED_TYPE_OPTIONS = [
  { value: 'numeric', label: 'Numeric' },
  { value: 'string', label: 'String' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'temporal', label: 'Temporal' },
];

export const ListConfigPanel: React.FC<ListConfigPanelProps> = ({
  config,
  onChange,
  flowId,
  groupId,
  nestingLevel = 0,
}) => {
  const [expandedEmbeddedIndex, setExpandedEmbeddedIndex] = useState<number | null>(null);

  const selectionStrategy = config.selectionStrategy || 'WEIGHTED_RANDOM';
  const items: ListItemConfig[] = (config.items || []).map((item, idx) => {
    if (typeof item === 'object' && item !== null) {
      return {
        id: item.id || `item_${idx + 1}`,
        value: item.value ?? '',
        weight: item.weight ?? 1.0,
        isEmbedded: !!item.isEmbedded,
        embeddedType: item.embeddedType || 'numeric',
        embeddedConfig: item.embeddedConfig || {},
      };
    }
    return {
      id: `item_${idx + 1}`,
      value: item,
      weight: 1.0,
      isEmbedded: false,
      embeddedType: 'numeric',
      embeddedConfig: {},
    };
  });

  const transitionMatrix = config.transitionMatrix || {};

  const handleStrategyChange = (newStrategy: ListSelectionStrategy) => {
    const updatedMatrix = { ...transitionMatrix };
    if (newStrategy === 'MARKOV_CHAIN') {
      items.forEach((fromItem) => {
        if (!updatedMatrix[fromItem.id]) {
          updatedMatrix[fromItem.id] = {};
        }
        items.forEach((toItem) => {
          if (updatedMatrix[fromItem.id][toItem.id] === undefined) {
            updatedMatrix[fromItem.id][toItem.id] = 1.0 / items.length;
          }
        });
      });
    }

    onChange({
      selectionStrategy: newStrategy,
      transitionMatrix: updatedMatrix,
    });
  };

  const handleAddItem = () => {
    const nextId = `item_${items.length + 1}`;
    const newItem: ListItemConfig = {
      id: nextId,
      value: `Item ${items.length + 1}`,
      weight: 1.0,
      isEmbedded: false,
      embeddedType: 'numeric',
      embeddedConfig: { min: 0, max: 100, precision: 'INTEGER' },
    };
    const newItems = [...items, newItem];

    const updatedMatrix = { ...transitionMatrix };
    if (selectionStrategy === 'MARKOV_CHAIN') {
      updatedMatrix[nextId] = {};
      newItems.forEach((target) => {
        updatedMatrix[nextId][target.id] = 1.0 / newItems.length;
      });
      newItems.forEach((source) => {
        if (!updatedMatrix[source.id]) updatedMatrix[source.id] = {};
        updatedMatrix[source.id][nextId] = 1.0 / newItems.length;
      });
    }

    onChange({
      items: newItems,
      transitionMatrix: updatedMatrix,
    });
  };

  const handleRemoveItem = (index: number) => {
    const removedItem = items[index];
    const newItems = items.filter((_, i) => i !== index);

    const updatedMatrix = { ...transitionMatrix };
    if (removedItem && removedItem.id) {
      delete updatedMatrix[removedItem.id];
      Object.keys(updatedMatrix).forEach((key) => {
        delete updatedMatrix[key][removedItem.id];
      });
    }

    if (expandedEmbeddedIndex === index) {
      setExpandedEmbeddedIndex(null);
    } else if (expandedEmbeddedIndex !== null && expandedEmbeddedIndex > index) {
      setExpandedEmbeddedIndex(expandedEmbeddedIndex - 1);
    }

    onChange({
      items: newItems,
      transitionMatrix: updatedMatrix,
    });
  };

  const handleItemChange = (index: number, patch: Partial<ListItemConfig>) => {
    const newItems = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange({ items: newItems });
  };

  const handleMatrixCellChange = (fromId: string, toId: string, valStr: string) => {
    const parsedVal = parseFloat(valStr);
    const updatedMatrix = { ...transitionMatrix };
    if (!updatedMatrix[fromId]) {
      updatedMatrix[fromId] = {};
    }
    updatedMatrix[fromId][toId] = isNaN(parsedVal) ? 0 : parsedVal;
    onChange({ transitionMatrix: updatedMatrix });
  };

  const renderEmbeddedPanel = (item: ListItemConfig, index: number) => {
    const subType = item.embeddedType || 'numeric';
    const subConfig = item.embeddedConfig || {};

    const handleSubConfigChange = (newSubConfig: any) => {
      handleItemChange(index, {
        embeddedConfig: { ...subConfig, ...newSubConfig }
      });
    };

    switch (subType) {
      case 'numeric':
        return <NumericConfigPanel config={subConfig as any} onChange={handleSubConfigChange} flowId={flowId} groupId={groupId} />;
      case 'string':
        return <StringConfigPanel config={subConfig as any} onChange={handleSubConfigChange} />;
      case 'boolean':
        return <BooleanConfigPanel config={subConfig as any} onChange={handleSubConfigChange} />;
      case 'temporal':
        return <TemporalConfigPanel config={subConfig as any} onChange={handleSubConfigChange} />;
      default:
        return <NumericConfigPanel config={subConfig as any} onChange={handleSubConfigChange} flowId={flowId} groupId={groupId} />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="selection-strategy-select" className="text-[10px] uppercase text-[var(--c-tx4)]">Selection Strategy</Label>
        <CustomDropdown
          id="selection-strategy-select"
          value={selectionStrategy}
          onChange={(val) => handleStrategyChange(val as ListSelectionStrategy)}
          options={STRATEGY_OPTIONS}
        />
      </div>

      <div className="flex items-center gap-2 p-2 rounded bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-300/90">
        <Info className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
        <span>Sub-variables support 1 level of embedded generator configuration for heterogeneous data items.</span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label className="text-[10px] uppercase text-[var(--c-tx4)]">List Items & Generators</Label>
          <Button variant="outline" size="sm" onClick={handleAddItem} className="h-7 text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Item
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No items added yet. Click 'Add Item' to start.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto p-1 scrollbar-thin">
            {items.map((item, idx) => {
              const val = item.value ?? '';
              const weight = item.weight ?? 1.0;
              const isEmbedded = !!item.isEmbedded;
              const embeddedType = item.embeddedType || 'numeric';
              const isExpanded = expandedEmbeddedIndex === idx;

              const modeOptions = [
                { value: 'LITERAL', label: 'Literal' },
                ...(nestingLevel === 0 ? [{ value: 'EMBEDDED', label: 'Dynamic Generator' }] : []),
              ];

              return (
                <div key={item.id} className="rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <div className="w-36">
                      <CustomDropdown
                        value={isEmbedded ? 'EMBEDDED' : 'LITERAL'}
                        onChange={(newVal) => {
                          const newIsEmbedded = newVal === 'EMBEDDED';
                          handleItemChange(idx, { isEmbedded: newIsEmbedded });
                          if (newIsEmbedded) {
                            setExpandedEmbeddedIndex(idx);
                          } else if (expandedEmbeddedIndex === idx) {
                            setExpandedEmbeddedIndex(null);
                          }
                        }}
                        options={modeOptions}
                      />
                    </div>

                    {!isEmbedded ? (
                      <Input
                        className="flex-1 h-8 text-xs font-mono"
                        placeholder="Value (Literal)"
                        value={val}
                        onChange={(e) => handleItemChange(idx, { value: e.target.value })}
                      />
                    ) : (
                      <div className="flex-1 flex gap-2 items-center">
                        <div className="w-32">
                          <CustomDropdown
                            value={embeddedType}
                            onChange={(newVal) => handleItemChange(idx, { embeddedType: newVal as VariableType })}
                            options={EMBEDDED_TYPE_OPTIONS}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedEmbeddedIndex(isExpanded ? null : idx)}
                          className="h-8 text-xs text-violet-400 hover:text-violet-300"
                        >
                          <Layers className="w-3.5 h-3.5 mr-1" />
                          {isExpanded ? 'Hide Panel' : 'Configure Sub-Generator'}
                        </Button>
                      </div>
                    )}

                    {/* Weight Input (Relevant for WEIGHTED_RANDOM) */}
                    {selectionStrategy === 'WEIGHTED_RANDOM' && (
                      <div className="w-20">
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="Weight"
                          value={weight}
                          onChange={(e) => handleItemChange(idx, { weight: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    )}

                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveItem(idx)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>

                  {/* Sub-Generator Config Collapsible Panel */}
                  {isEmbedded && isExpanded && (
                    <div className="mt-2 p-3 rounded border border-violet-500/30 bg-violet-950/20 space-y-2">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-violet-300">
                        <RefreshCw className="w-3 h-3 animate-spin-slow" />
                        <span>Sub-Generator Configuration ({embeddedType.toUpperCase()})</span>
                      </div>
                      {renderEmbeddedPanel(item, idx)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Markov Chain Transition Matrix */}
      {selectionStrategy === 'MARKOV_CHAIN' && items.length > 0 && (
        <div className="space-y-2 mt-4 pt-4 border-t border-[var(--c-br1)]">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">Markov Transition Probability Matrix (%)</Label>
          </div>
          <div className="overflow-x-auto border border-[var(--c-br1)] rounded bg-[var(--c-bg2)] p-2">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[10px] text-[var(--c-tx4)]">From \ To</th>
                  {items.map((target, targetIdx) => (
                    <th key={target.id || targetIdx} className="p-1 text-center text-[10px] text-[var(--c-tx2)]">
                      {target.value ? String(target.value).substring(0, 8) : `Item ${targetIdx + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((source, sourceIdx) => (
                  <tr key={source.id || sourceIdx} className="border-t border-white/5">
                    <td className="p-1 font-semibold text-[var(--c-tx2)]">
                      {source.value ? String(source.value).substring(0, 8) : `Item ${sourceIdx + 1}`}
                    </td>
                    {items.map((target, targetIdx) => {
                      const sourceId = source.id || `item_${sourceIdx}`;
                      const targetId = target.id || `item_${targetIdx}`;
                      const prob = (transitionMatrix[sourceId] && transitionMatrix[sourceId][targetId]) ?? 0;

                      return (
                        <td key={targetId} className="p-1 text-center">
                          <Input
                            type="number"
                            step="0.05"
                            min={0}
                            max={1}
                            value={prob}
                            onChange={(e) => handleMatrixCellChange(sourceId, targetId, e.target.value)}
                            className="h-7 w-16 text-center text-xs font-mono mx-auto"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
