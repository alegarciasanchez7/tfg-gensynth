import React, { useState, useMemo, useCallback } from 'react';
import { ListVariableConfig, ListItemConfig, ListSelectionStrategy, VariableType, VariableScope } from '../../../../types';
import { Input } from '../../../ui/input';
import { Label } from '../../../ui/label';
import { Button } from '../../../ui/button';
import { CustomDropdown } from '../../../ui/custom-dropdown';
import { Trash2, Plus, Info, Settings, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/tooltip';
import { NumericConfigPanel } from './NumericConfigPanel';
import { StringConfigPanel } from './StringConfigPanel';
import { BooleanConfigPanel } from './BooleanConfigPanel';
import { TemporalConfigPanel } from './TemporalConfigPanel';
import { ListReferenceSelector } from './ListReferenceSelector';
import { useApp } from '../../../../context';

interface ListConfigPanelProps {
  config: ListVariableConfig;
  onChange: (newConfig: Partial<ListVariableConfig>) => void;
  flowId?: string;
  groupId?: string;
  variableScope?: VariableScope;
  nestingLevel?: number;
}

const STRATEGY_OPTIONS = [
  { value: 'WEIGHTED_RANDOM', label: 'Weighted Random (Probabilistic)' },
  { value: 'SEQUENTIAL', label: 'Sequential (Round-Robin)' },
  { value: 'SHUFFLE', label: 'Shuffle (No repeat until exhausted)' },
  { value: 'MARKOV_CHAIN', label: 'Markov Chain (State Transition Matrix)' },
  { value: 'FIXED_SUBSET', label: 'Fixed Subset / Entire List (Returns array of items)' },
];

const STRATEGY_DESCRIPTIONS: Record<ListSelectionStrategy, string> = {
  WEIGHTED_RANDOM: 'Selects a single item probabilistically on each tick based on assigned weights.',
  SEQUENTIAL: 'Selects a single item sequentially from the list in round-robin order.',
  SHUFFLE: 'Selects single items in randomized order without repeats until all items are used, then reshuffles.',
  MARKOV_CHAIN: 'Transitions between single items based on state transition probabilities.',
  FIXED_SUBSET: 'Returns an array of items (or full list). In Message Format, referencing {{scope.var}} outputs all items, while referencing {{scope.var.itemX}} outputs specific single items.',
};

const EMBEDDED_TYPE_OPTIONS = [
  { value: 'numeric', label: 'Numeric' },
  { value: 'string', label: 'String' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'temporal', label: 'Temporal' },
];

const EmbeddedSubGeneratorPanel = React.memo<{
  item: ListItemConfig;
  index: number;
  flowId?: string;
  groupId?: string;
  onItemChange: (index: number, patch: Partial<ListItemConfig>) => void;
}>(({ item, index, flowId, groupId, onItemChange }) => {
  const subType = item.embeddedType || 'numeric';
  const subConfig = item.embeddedConfig || {};

  const handleSubConfigChange = useCallback((newSubConfig: any) => {
    onItemChange(index, {
      embeddedConfig: { ...subConfig, ...newSubConfig }
    });
  }, [index, subConfig, onItemChange]);

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
});
EmbeddedSubGeneratorPanel.displayName = 'EmbeddedSubGeneratorPanel';

export const ListConfigPanel: React.FC<ListConfigPanelProps> = ({
  config,
  onChange,
  flowId,
  groupId,
  variableScope,
  nestingLevel = 0,
}) => {
  let state: any = { variables: [] };
  try {
    const appCtx = useApp();
    if (appCtx && appCtx.state) {
      state = appCtx.state;
    }
  } catch (ignored) {}

  const [modalEmbeddedIndex, setModalEmbeddedIndex] = useState<number | null>(null);

  const selectionStrategy = config.selectionStrategy || 'WEIGHTED_RANDOM';

  const items: ListItemConfig[] = useMemo(() => {
    return (config.items || []).map((item, idx) => {
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
  }, [config.items]);

  const parentList = useMemo(() => {
    return (state.variables || []).find((v: any) => v.id === config.sourceListVariableId || v.name === config.sourceListVariableId);
  }, [state.variables, config.sourceListVariableId]);

  const parentItems: any[] = useMemo(() => parentList?.config?.items || [], [parentList]);

  const inheritedItems: any[] = useMemo(() => {
    if (!config.sourceListVariableId || parentItems.length === 0) return [];
    const selectionMode = config.sourceListSelectionMode || 'SUBSET_SPECIFIC';
    if (selectionMode === 'SUBSET_SPECIFIC' && config.selectedListItemIds && config.selectedListItemIds.length > 0) {
      return config.selectedListItemIds
        .map((id: string) => parentItems.find((p: any) => p.id === id || (p.value && String(p.value) === id)))
        .filter(Boolean);
    } else if (selectionMode === 'SUBSET_RANDOM') {
      const count = Math.min(Math.max(1, config.randomSubsetCount || 1), parentItems.length || 100);
      const parentName = parentList?.name || 'Parent List';
      return Array.from({ length: count }, (_, i) => ({
        id: `random_item_${i + 1}`,
        value: `Random Item ${i + 1} - ${parentName}`,
        weight: 1.0,
      }));
    } else if (selectionMode === 'FIXED_ITEM' && config.selectedListItemId) {
      const match = parentItems.find((p: any) => p.id === config.selectedListItemId || (p.value && String(p.value) === config.selectedListItemId));
      return match ? [match] : [];
    } else {
      return parentItems;
    }
  }, [config.sourceListVariableId, config.sourceListSelectionMode, config.selectedListItemIds, config.randomSubsetCount, config.selectedListItemId, parentItems, parentList?.name]);

  const unifiedItems: any[] = useMemo(() => {
    let list = [
      ...inheritedItems.map((item: any) => ({ ...item, isInherited: true })),
      ...items.map((item: ListItemConfig, localIdx: number) => ({ ...item, localIdx, isInherited: false })),
    ];

    if (config.itemOrder && config.itemOrder.length > 0) {
      const orderMap = new Map(config.itemOrder.map((id: string, index: number) => [id, index]));
      list.sort((a, b) => {
        const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : (orderMap.has(String(a.value)) ? orderMap.get(String(a.value))! : 99999);
        const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : (orderMap.has(String(b.value)) ? orderMap.get(String(b.value))! : 99999);
        return idxA - idxB;
      });
    }
    return list;
  }, [inheritedItems, items, config.itemOrder]);

  const transitionMatrix = config.transitionMatrix || {};

  const handleStrategyChange = useCallback((newStrategy: ListSelectionStrategy) => {
    const updatedMatrix = { ...transitionMatrix };
    if (newStrategy === 'MARKOV_CHAIN' && unifiedItems.length > 0) {
      unifiedItems.forEach((fromItem: any) => {
        const fromId = fromItem.id || String(fromItem.value);
        if (!updatedMatrix[fromId]) {
          updatedMatrix[fromId] = {};
        }
        unifiedItems.forEach((toItem: any) => {
          const toId = toItem.id || String(toItem.value);
          if (updatedMatrix[fromId][toId] === undefined) {
            updatedMatrix[fromId][toId] = 1.0 / unifiedItems.length;
          }
        });
      });
    }

    onChange({
      selectionStrategy: newStrategy,
      transitionMatrix: updatedMatrix,
    });
  }, [unifiedItems, transitionMatrix, onChange]);

  const handleAddItem = useCallback(() => {
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
    const newUnified = [...unifiedItems, { ...newItem, isInherited: false }];

    const updatedMatrix = { ...transitionMatrix };
    if (selectionStrategy === 'MARKOV_CHAIN') {
      updatedMatrix[nextId] = {};
      newUnified.forEach((target: any) => {
        const targetId = target.id || String(target.value);
        updatedMatrix[nextId][targetId] = 1.0 / newUnified.length;
      });
      newUnified.forEach((source: any) => {
        const sourceId = source.id || String(source.value);
        if (!updatedMatrix[sourceId]) updatedMatrix[sourceId] = {};
        updatedMatrix[sourceId][nextId] = 1.0 / newUnified.length;
      });
    }

    onChange({
      items: newItems,
      transitionMatrix: updatedMatrix,
    });
  }, [items, unifiedItems, selectionStrategy, transitionMatrix, onChange]);

  const handleRemoveItem = useCallback((index: number) => {
    const removedItem = items[index];
    const newItems = items.filter((_, i) => i !== index);

    const updatedMatrix = { ...transitionMatrix };
    if (removedItem && (removedItem.id || removedItem.value)) {
      const removedId = removedItem.id || String(removedItem.value);
      delete updatedMatrix[removedId];
      Object.keys(updatedMatrix).forEach((key) => {
        if (updatedMatrix[key]) {
          delete updatedMatrix[key][removedId];
        }
      });
    }

    onChange({
      items: newItems,
      transitionMatrix: updatedMatrix,
    });
  }, [items, transitionMatrix, onChange]);

  const handleMoveUnifiedItem = useCallback((index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= unifiedItems.length) return;

    const newUnified = [...unifiedItems];
    const temp = newUnified[index];
    newUnified[index] = newUnified[targetIndex];
    newUnified[targetIndex] = temp;

    const newItemOrder = newUnified.map((item: any) => item.id || String(item.value));

    // Preserve local items array structure
    const newLocalItemsOrder = newUnified.filter((item: any) => !item.isInherited);
    const newItems = newLocalItemsOrder.map((item: any) => {
      const { isInherited, localIdx, ...rest } = item;
      return rest as ListItemConfig;
    });

    // Preserve selectedListItemIds array structure
    const newSelectedListItemIds = newUnified.filter((item: any) => item.isInherited).map((item: any) => item.id || String(item.value));

    onChange({
      itemOrder: newItemOrder,
      selectedListItemIds: newSelectedListItemIds.length > 0 ? newSelectedListItemIds : config.selectedListItemIds,
      items: newItems,
    });
  }, [unifiedItems, config.selectedListItemIds, onChange]);

  const handleItemChange = useCallback((index: number, patch: Partial<ListItemConfig>) => {
    const newItems = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange({ items: newItems });
  }, [items, onChange]);

  const handleMatrixCellChange = useCallback((fromId: string, toId: string, valStr: string) => {
    const parsedVal = parseFloat(valStr);
    const updatedMatrix = { ...transitionMatrix };
    if (!updatedMatrix[fromId]) {
      updatedMatrix[fromId] = {};
    }
    updatedMatrix[fromId][toId] = isNaN(parsedVal) ? 0 : parsedVal;
    onChange({ transitionMatrix: updatedMatrix });
  }, [transitionMatrix, onChange]);

  return (
    <div className="space-y-4">
      {nestingLevel === 0 && (
        <ListReferenceSelector
          config={config}
          onChange={onChange}
          variableScope={variableScope || 'local'}
          variableType="list"
          flowId={flowId}
          groupId={groupId}
        />
      )}

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="selection-strategy-select" className="text-[10px] uppercase text-[var(--c-tx4)]">
            Selection Strategy
          </Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-[var(--c-tx4)] hover:text-cyan-400 cursor-help transition-colors"
                aria-label="Selection strategy info"
              >
                <Info size={12} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px] space-y-1 text-[11px] leading-relaxed">
              <p className="font-semibold text-cyan-400">{selectionStrategy}</p>
              <p>{STRATEGY_DESCRIPTIONS[selectionStrategy] || 'Strategy for selecting items from the list.'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
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

        {items.length === 0 && inheritedItems.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No items added yet. Select items to inherit above or click 'Add Item' to start.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto p-1 scrollbar-thin">
            {unifiedItems.map((item: any, unifiedIdx: number) => {
              if (item.isInherited) {
                return (
                  <div key={item.id || `inh_${unifiedIdx}`} className="rounded border border-violet-500/30 bg-violet-950/20 p-2 space-y-2">
                    <div className="flex gap-2 items-center">
                      <div className="w-36 flex items-center justify-between gap-1 px-2.5 h-8 rounded border border-violet-500/30 bg-violet-500/10 text-[11px] font-mono text-violet-300 shrink-0">
                        <span className="font-semibold text-violet-300">Inherited</span>
                        <span className="text-[9px] text-violet-400/80 truncate">({parentList?.name || 'Parent'})</span>
                      </div>

                      <Input
                        className="flex-1 h-8 text-xs font-mono border-violet-500/30 bg-black/30 text-violet-200 cursor-not-allowed opacity-90"
                        value={item.value ?? item.id ?? ''}
                        readOnly
                        disabled
                        title="Value inherited from parent list"
                      />

                      {selectionStrategy === 'WEIGHTED_RANDOM' && (
                        <div className="w-20">
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="Weight"
                            value={item.weight ?? 1.0}
                            readOnly
                            disabled
                            className="h-8 text-xs font-mono border-violet-500/30 bg-black/30 text-violet-200 cursor-not-allowed opacity-90"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-violet-300 hover:text-white disabled:opacity-30 p-0"
                          disabled={unifiedIdx === 0}
                          onClick={() => handleMoveUnifiedItem(unifiedIdx, 'up')}
                          title="Move Up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-violet-300 hover:text-white disabled:opacity-30 p-0"
                          disabled={unifiedIdx === unifiedItems.length - 1}
                          onClick={() => handleMoveUnifiedItem(unifiedIdx, 'down')}
                          title="Move Down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              const localIdx = item.localIdx;
              const val = item.value ?? '';
              const weight = item.weight ?? 1.0;
              const isEmbedded = !!item.isEmbedded;
              const embeddedType = item.embeddedType || 'numeric';

              const modeOptions = [
                { value: 'LITERAL', label: 'Literal' },
                ...(nestingLevel === 0 ? [{ value: 'EMBEDDED', label: 'Dynamic Generator' }] : []),
              ];

              return (
                <div key={item.id || `local_${localIdx}`} className="rounded border border-[var(--c-br1)] bg-[var(--c-bg2)] p-2 space-y-2">
                  <div className="flex gap-2 items-center">
                    <div className="w-36">
                      <CustomDropdown
                        value={isEmbedded ? 'EMBEDDED' : 'LITERAL'}
                        onChange={(newVal) => {
                          const newIsEmbedded = newVal === 'EMBEDDED';
                          handleItemChange(localIdx, { isEmbedded: newIsEmbedded });
                          if (newIsEmbedded) {
                            setModalEmbeddedIndex(localIdx);
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
                        onChange={(e) => handleItemChange(localIdx, { value: e.target.value })}
                      />
                    ) : (
                      <div className="flex-1 flex gap-2 items-center">
                        <div className="w-32">
                          <CustomDropdown
                            value={embeddedType}
                            onChange={(newVal) => handleItemChange(localIdx, { embeddedType: newVal as VariableType })}
                            options={EMBEDDED_TYPE_OPTIONS}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setModalEmbeddedIndex(localIdx)}
                          className="h-8 text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
                          title="Configure generator parameters for this item"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>Configure Item</span>
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
                          onChange={(e) => handleItemChange(localIdx, { weight: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[var(--c-tx3)] hover:text-[var(--c-tx1)] disabled:opacity-30 p-0"
                        disabled={unifiedIdx === 0}
                        onClick={() => handleMoveUnifiedItem(unifiedIdx, 'up')}
                        title="Move Up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[var(--c-tx3)] hover:text-[var(--c-tx1)] disabled:opacity-30 p-0"
                        disabled={unifiedIdx === unifiedItems.length - 1}
                        onClick={() => handleMoveUnifiedItem(unifiedIdx, 'down')}
                        title="Move Down"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-400 p-0"
                        onClick={() => handleRemoveItem(localIdx)}
                        title="Delete Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Markov Chain Transition Matrix */}
      {selectionStrategy === 'MARKOV_CHAIN' && unifiedItems.length > 0 && (
        <div className="space-y-2 mt-4 pt-4 border-t border-[var(--c-br1)]">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] uppercase text-[var(--c-tx4)]">Markov Transition Probability Matrix (%)</Label>
          </div>
          <div className="overflow-x-auto border border-[var(--c-br1)] rounded bg-[var(--c-bg2)] p-2">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[10px] text-[var(--c-tx4)]">From \ To</th>
                  {unifiedItems.map((target: any, targetIdx: number) => {
                    const label = target.isInherited
                      ? (target.value !== undefined && target.value !== '' ? String(target.value) : `Item ${targetIdx + 1}`)
                      : (target.isEmbedded
                          ? `Gen #${targetIdx + 1}`
                          : (target.value !== undefined && target.value !== '' ? String(target.value) : `Item ${targetIdx + 1}`));
                    return (
                      <th key={target.id || `target_${targetIdx}`} className="p-1 text-center text-[10px] text-[var(--c-tx2)]" title={String(label)}>
                        {String(label).length > 10 ? String(label).substring(0, 10) + '…' : String(label)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {unifiedItems.map((source: any, sourceIdx: number) => {
                  const sourceId = source.id || String(source.value || `item_${sourceIdx + 1}`);
                  const sourceLabel = source.isInherited
                    ? (source.value !== undefined && source.value !== '' ? String(source.value) : `Item ${sourceIdx + 1}`)
                    : (source.isEmbedded
                        ? `Gen #${sourceIdx + 1}`
                        : (source.value !== undefined && source.value !== '' ? String(source.value) : `Item ${sourceIdx + 1}`));

                  return (
                    <tr key={sourceId || sourceIdx} className="border-t border-white/5">
                      <td className="p-1 font-semibold text-[var(--c-tx2)]" title={String(sourceLabel)}>
                        {String(sourceLabel).length > 10 ? String(sourceLabel).substring(0, 10) + '…' : String(sourceLabel)}
                      </td>
                      {unifiedItems.map((target: any, targetIdx: number) => {
                        const targetId = target.id || String(target.value || `item_${targetIdx + 1}`);
                        const rawProb = transitionMatrix[sourceId] && transitionMatrix[sourceId][targetId];
                        const prob = rawProb !== undefined ? rawProb : (1.0 / unifiedItems.length);

                        return (
                          <td key={`${sourceId}_${targetId}`} className="p-1 text-center">
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Sub-Generator Item Configuration Modal */}
      <Dialog open={modalEmbeddedIndex !== null} onOpenChange={(open) => !open && setModalEmbeddedIndex(null)}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[85vh] bg-[var(--c-bg2)] border border-violet-500/40 text-[var(--c-tx1)] p-6 space-y-4 rounded-xl shadow-2xl overflow-y-auto">
          {modalEmbeddedIndex !== null && items[modalEmbeddedIndex] && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-mono text-violet-300 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-violet-400" />
                  <span>Configure Item ({(items[modalEmbeddedIndex].embeddedType || 'numeric').toUpperCase()})</span>
                </DialogTitle>
                <DialogDescription className="text-xs font-mono text-[var(--c-tx3)]">
                  Editing generator settings for Item #{modalEmbeddedIndex + 1}
                </DialogDescription>
              </DialogHeader>

              <div className="p-4 rounded-lg border border-violet-500/20 bg-violet-950/20 space-y-4">
                <EmbeddedSubGeneratorPanel
                  item={items[modalEmbeddedIndex]}
                  index={modalEmbeddedIndex}
                  flowId={flowId}
                  groupId={groupId}
                  onItemChange={handleItemChange}
                />
              </div>

              <DialogFooter className="flex justify-end gap-2 pt-3 border-t border-[var(--c-br1)]">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setModalEmbeddedIndex(null)}
                  className="h-8 text-xs bg-violet-600 hover:bg-violet-500 text-white font-mono flex items-center gap-1.5 px-4"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply Changes</span>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
