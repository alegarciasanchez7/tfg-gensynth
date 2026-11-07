import React, { useState } from 'react';
import { useApp } from '../../../../context';
import { BaseVariableConfig, ListReferenceSelectionMode, Variable, VariableScope, VariableType } from '../../../../types';
import { Label } from '../../../ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/tooltip';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** How a variable that is not a List takes its value from the source list. */
const ITEM_MODES: readonly { value: ListReferenceSelectionMode; label: string }[] = [
  { value: 'RANDOM_ITEM', label: 'Random Item' },
  { value: 'FIXED_ITEM', label: 'Specific Fixed' },
  { value: 'INHERITED_GENERATION', label: 'Inherited Generation' },
];

/** Names of the list strategies, as the List editor shows them. */
const STRATEGY_NAMES: Record<string, string> = {
  WEIGHTED_RANDOM: 'Weighted Random',
  SEQUENTIAL: 'Sequential',
  SHUFFLE: 'Shuffle',
  MARKOV_CHAIN: 'Markov Chain',
  FIXED_SUBSET: 'Fixed Subset',
};

interface ListReferenceSelectorProps {
  config: BaseVariableConfig;
  onChange: (newConfig: Record<string, any>) => void;
  variableScope: VariableScope;
  /** A List variable cannot inherit from another list, so it never shows this selector. */
  variableType: Exclude<VariableType, 'list'>;
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
  } catch {
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
  // Without a list to read from there is nothing to inherit (an enabled box can still be cleared)
  const noListToInherit = !isEnabled && accessibleListVariables.length === 0;
  const sourceScopes = variableScope === 'global' ? 'Global' : 'Global or Group';
  const missingListHint = variableScope === 'global'
    ? 'Create another GLOBAL List variable first: a GLOBAL variable can only inherit from GLOBAL lists.'
    : 'Create a GLOBAL List variable, or a GROUP List variable in this group, first.';
  const selectedList = accessibleListVariables.find((v: Variable) => v.id === config.sourceListVariableId || v.name === config.sourceListVariableId);

  // Get items of selected list
  const listItems: any[] = selectedList?.config?.items || [];

  // Filter items compatible with target variable type according to rules:
  // - Literal items (isEmbedded == false): Treated as string
  // - Dynamic items (isEmbedded == true): Classified by explicit embeddedType
  const compatibleItems = listItems.filter((item: any) => {
    if (variableType === 'string') {
      return !item.isEmbedded || item.embeddedType === 'string';
    }
    return item.isEmbedded && item.embeddedType === variableType;
  });

  const selectionMode: ListReferenceSelectionMode = config.sourceListSelectionMode || 'RANDOM_ITEM';
  // Same default as the List editor and the Core
  const sourceStrategy: string = selectedList?.config?.selectionStrategy || 'WEIGHTED_RANDOM';
  const itemModeHint = selectionMode === 'FIXED_ITEM'
    ? 'Always the item chosen below.'
    : selectionMode === 'INHERITED_GENERATION'
      ? (sourceStrategy === 'FIXED_SUBSET'
        ? 'The list uses Fixed Subset, so a random item is picked on every value.'
        : `Items are picked as the list picks them (${STRATEGY_NAMES[sourceStrategy] ?? sourceStrategy}), keeping their own position: the list's sequence is not moved.`)
      : 'A random item of the list on every value.';

  const handleToggle = (checked: boolean) => {
    if (!checked) {
      onChange({
        sourceListVariableId: undefined,
        sourceListSelectionMode: undefined,
        selectedListItemId: undefined,
      });
    } else {
      const firstAvailable = accessibleListVariables[0];
      onChange({
        sourceListVariableId: firstAvailable ? firstAvailable.id : '',
        sourceListSelectionMode: 'RANDOM_ITEM',
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
          <Tooltip>
            {/* A disabled check box gets no hover events: the wrapper shows why it is disabled */}
            <TooltipTrigger asChild>
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enable-list-ref"
                  checked={isEnabled}
                  disabled={noListToInherit}
                  onChange={(e) => handleToggle(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--c-br2)] bg-[var(--c-bg1)] text-violet-500 focus:ring-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <Label
                  htmlFor="enable-list-ref"
                  className={`font-mono text-xs font-semibold ${noListToInherit ? 'text-[var(--c-tx4)] cursor-not-allowed' : 'text-[var(--c-tx1)] cursor-pointer'}`}
                >
                  Inherit value from parent-scope List
                </Label>
              </span>
            </TooltipTrigger>
            {noListToInherit && (
              <TooltipContent side="bottom" className="max-w-[280px] text-[11px] leading-relaxed">
                No List variable to inherit from. {missingListHint}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
        {isEnabled && accessibleListVariables.length === 0 && (
          <span className="text-[10px] text-amber-400 font-mono">No accessible lists</span>
        )}
      </div>

      {isEnabled && isExpanded && (
        <div className="space-y-3 pt-1 pl-5 border-l border-violet-500/20">
          <div>
            <Label className="text-[11px] text-[var(--c-tx3)] font-mono mb-1 block">
              Source List Variable ({sourceScopes})
            </Label>
            <select
              value={config.sourceListVariableId || ''}
              onChange={(e) => onChange({ sourceListVariableId: e.target.value, selectedListItemId: undefined })}
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
            <div className="space-y-2">
              <Label className="text-[11px] text-[var(--c-tx3)] font-mono block">Item Selection Mode</Label>
              <div className="grid grid-cols-3 gap-2">
                {ITEM_MODES.map(mode => {
                  // A Fixed Subset list gives an array, not one item, so there is no generation to inherit
                  const unavailable = mode.value === 'INHERITED_GENERATION' && sourceStrategy === 'FIXED_SUBSET';
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      disabled={unavailable}
                      title={unavailable ? 'Not available: a Fixed Subset list returns all its items at once' : undefined}
                      onClick={() => onChange({ sourceListSelectionMode: mode.value })}
                      className={`h-7 px-2 rounded text-xs font-mono border transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        selectionMode === mode.value
                          ? 'border-violet-500 bg-violet-500/20 text-violet-600 dark:text-violet-300 font-semibold'
                          : 'border-[var(--c-br2)] bg-[var(--c-bg2)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--c-tx4)] font-mono leading-relaxed">{itemModeHint}</p>

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
          )}
        </div>
      )}
    </div>
  );
};
