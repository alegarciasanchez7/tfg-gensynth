import React, { useState } from 'react';
import { useApp } from '../../../../context';
import { BaseVariableConfig, ListReferenceSelectionMode, Variable, VariableScope, VariableType } from '../../../../types';
import { Label } from '../../../ui/label';
import { Input } from '../../../ui/input';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ListReferenceSelectorProps {
  config: BaseVariableConfig;
  onChange: (newConfig: Record<string, any>) => void;
  variableScope: VariableScope;
  variableType: VariableType;
  flowId?: string;
  groupId?: string;
}

export const ListReferenceSelector: React.FC<ListReferenceSelectorProps> = ({
  config,
  onChange,
  variableScope,
  variableType,
  flowId,
  groupId,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  let state: any = { variables: [], groups: [], flows: [] };
  try {
    const appCtx = useApp();
    if (appCtx && appCtx.state) {
      state = appCtx.state;
    }
  } catch (ignored) {
    // Graceful fallback when rendered in isolated unit tests
  }

  // Find effective groupId:
  // 1. Direct groupId parameter
  // 2. Lookup flowId in state.flows or state.groups to resolve its groupId
  const foundFlow = flowId ? (state.flows || []).find((f: any) => f.id === flowId) : undefined;
  const flowGroupId = foundFlow?.groupId;
  const groupFromFlows = flowId ? (state.groups || []).find((g: any) => (g.flows || []).some((f: any) => f.id === flowId))?.id : undefined;
  const effectiveGroupId = groupId || flowGroupId || groupFromFlows;

  // Compute list variables that are accessible based on scope hierarchy rules:
  // - Global lists: Accessible to any variable (Global, Group, Local)
  // - Group lists: Accessible to Group variables in the same group and Local variables in flows of the same group
  // - Local lists: Cannot be referenced by other variables (restricted/non-exportable)
  const accessibleListVariables = (state.variables || []).filter((v: Variable) => {
    if (v.type !== 'list') return false;
    
    // Cannot reference self
    if (v.id === config.id || v.name === config.name) return false;

    if (v.scope === 'global') {
      return true; // Global lists accessible to all
    }

    if (v.scope === 'group') {
      // Accessible if target variable belongs to the same group
      return !!effectiveGroupId && v.groupId === effectiveGroupId;
    }

    // Local lists cannot give values to other variables
    return false;
  });

  const isEnabled = !!config.sourceListVariableId;
  const selectedList = accessibleListVariables.find((v: Variable) => v.id === config.sourceListVariableId || v.name === config.sourceListVariableId);

  // Get items of selected list
  const listItems: any[] = selectedList?.config?.items || [];

  // Filter items compatible with target variable type according to rules:
  // - Literal items (isEmbedded == false): Treated as string
  // - Dynamic items (isEmbedded == true): Classified by explicit embeddedType
  const compatibleItems = listItems.filter((item: any) => {
    if (variableType === 'list') return true; // List can absorb any item type
    if (variableType === 'string') {
      return !item.isEmbedded || item.embeddedType === 'string';
    }
    return item.isEmbedded && item.embeddedType === variableType;
  });

  const selectionMode: ListReferenceSelectionMode = config.sourceListSelectionMode || (variableType === 'list' ? 'SUBSET_SPECIFIC' : 'RANDOM_ITEM');

  const handleToggle = (checked: boolean) => {
    if (!checked) {
      onChange({
        sourceListVariableId: undefined,
        sourceListSelectionMode: undefined,
        selectedListItemId: undefined,
        selectedListItemIds: undefined,
        randomSubsetCount: undefined,
      });
    } else {
      const firstAvailable = accessibleListVariables[0];
      onChange({
        sourceListVariableId: firstAvailable ? firstAvailable.id : '',
        sourceListSelectionMode: variableType === 'list' ? 'SUBSET_SPECIFIC' : 'RANDOM_ITEM',
      });
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-[var(--c-br1)] bg-[var(--c-bg3)]/40 p-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isEnabled && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[var(--c-tx3)] hover:text-[var(--c-tx1)] transition-colors p-0.5"
              aria-label="Toggle list reference settings panel"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
          <input
            type="checkbox"
            id="enable-list-ref"
            checked={isEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[var(--c-br2)] bg-black/20 text-violet-500 focus:ring-violet-500/30"
          />
          <Label htmlFor="enable-list-ref" className="font-mono text-xs font-semibold text-[var(--c-tx1)] cursor-pointer">
            Inherit value from parent-scope List
          </Label>
        </div>
        {isEnabled && accessibleListVariables.length === 0 && (
          <span className="text-[10px] text-amber-400 font-mono">No accessible lists</span>
        )}
      </div>

      {isEnabled && isExpanded && (
        <div className="space-y-3 pt-1 pl-5 border-l border-violet-500/20">
          <div>
            <Label className="text-[11px] text-[var(--c-tx3)] font-mono mb-1 block">
              Source List Variable ({variableScope === 'local' ? 'Global or Group' : 'Global'})
            </Label>
            <select
              value={config.sourceListVariableId || ''}
              onChange={(e) => onChange({ sourceListVariableId: e.target.value, selectedListItemId: undefined, selectedListItemIds: undefined })}
              className="w-full h-8 rounded border border-[var(--c-br2)] bg-[var(--c-bg2)] px-2 py-1 text-xs text-[var(--c-tx1)] font-mono outline-none focus:border-violet-500"
            >
              <option value="" disabled>-- Select a list --</option>
              {accessibleListVariables.map((v: Variable) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.scope.toUpperCase()}) - {v.config?.items?.length || 0} items
                </option>
              ))}
            </select>
          </div>

          {selectedList && (
            <>
              {variableType !== 'list' ? (
                // Mode selector for regular variables
                <div className="space-y-2">
                  <Label className="text-[11px] text-[var(--c-tx3)] font-mono block">Item Selection Mode</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onChange({ sourceListSelectionMode: 'RANDOM_ITEM' })}
                      className={`h-7 px-2 rounded text-xs font-mono border transition-all ${
                        selectionMode === 'RANDOM_ITEM'
                          ? 'border-violet-500 bg-violet-500/20 text-violet-300 font-semibold'
                          : 'border-[var(--c-br2)] bg-[var(--c-bg2)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)]'
                      }`}
                    >
                      🎲 Random Item
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange({ sourceListSelectionMode: 'FIXED_ITEM' })}
                      className={`h-7 px-2 rounded text-xs font-mono border transition-all ${
                        selectionMode === 'FIXED_ITEM'
                          ? 'border-violet-500 bg-violet-500/20 text-violet-300 font-semibold'
                          : 'border-[var(--c-br2)] bg-[var(--c-bg2)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)]'
                      }`}
                    >
                      📌 Specific Fixed
                    </button>
                  </div>

                  {selectionMode === 'FIXED_ITEM' && (
                    <div className="pt-1">
                      <Label className="text-[10px] text-[var(--c-tx4)] font-mono mb-1 block">
                        Compatible Specific Item ({compatibleItems.length} available)
                      </Label>
                      <select
                        value={config.selectedListItemId || ''}
                        onChange={(e) => onChange({ selectedListItemId: e.target.value })}
                        className="w-full h-8 rounded border border-[var(--c-br2)] bg-[var(--c-bg2)] px-2 py-1 text-xs text-[var(--c-tx1)] font-mono outline-none focus:border-violet-500"
                      >
                        <option value="" disabled>-- Select an item --</option>
                        {compatibleItems.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.value || item.id} ({item.isEmbedded ? `Dynamic: ${item.embeddedType}` : 'Literal String'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                // Mode selector for List variables creating sub-lists
                <div className="space-y-2">
                  <Label className="text-[11px] text-[var(--c-tx3)] font-mono block">Source List Subset</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onChange({ sourceListSelectionMode: 'SUBSET_SPECIFIC' })}
                      className={`h-7 px-2 rounded text-xs font-mono border transition-all ${
                        selectionMode === 'SUBSET_SPECIFIC'
                          ? 'border-violet-500 bg-violet-500/20 text-violet-300 font-semibold'
                          : 'border-[var(--c-br2)] bg-[var(--c-bg2)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)]'
                      }`}
                    >
                      ☑ Fixed Subset
                    </button>
                    <button
                      type="button"
                      onClick={() => onChange({ sourceListSelectionMode: 'SUBSET_RANDOM' })}
                      className={`h-7 px-2 rounded text-xs font-mono border transition-all ${
                        selectionMode === 'SUBSET_RANDOM'
                          ? 'border-violet-500 bg-violet-500/20 text-violet-300 font-semibold'
                          : 'border-[var(--c-br2)] bg-[var(--c-bg2)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)]'
                      }`}
                    >
                      🎲 N Random
                    </button>
                  </div>

                  {selectionMode === 'SUBSET_SPECIFIC' && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-[10px] text-[var(--c-tx4)] font-mono block">
                        Select items to include in this sub-list:
                      </Label>
                      <div className="max-h-32 overflow-y-auto space-y-1 rounded border border-[var(--c-br2)] bg-black/20 p-2">
                        {listItems.map((item: any) => {
                          const isSelected = (config.selectedListItemIds || []).includes(item.id);
                          return (
                            <label key={item.id} className="flex items-center gap-2 text-xs font-mono text-[var(--c-tx2)] hover:text-[var(--c-tx1)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const currentIds = config.selectedListItemIds || [];
                                  const newIds = e.target.checked
                                    ? [...currentIds, item.id]
                                    : currentIds.filter(id => id !== item.id);
                                  onChange({ selectedListItemIds: newIds });
                                }}
                                className="h-3 w-3 rounded border-[var(--c-br2)] text-violet-500"
                              />
                              <span>{item.value || item.id}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectionMode === 'SUBSET_RANDOM' && (
                    <div className="pt-1">
                      <Label className="text-[10px] text-[var(--c-tx4)] font-mono mb-1 block">
                        Number of random items to select
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={listItems.length}
                        value={config.randomSubsetCount || 1}
                        onChange={(e) => onChange({ randomSubsetCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="h-8 font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
