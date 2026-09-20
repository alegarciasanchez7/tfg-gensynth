import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../../context';
import type { Variable } from '../../../types';

interface TemplateEditorProps {
  value: string;
  onChange: (val: string) => void;
  variables: Variable[];
  flowId: string;
  groupId: string;
  className?: string;
}

function getEffectiveListItems(v: Variable, variables: Variable[]): Array<{ id: string; label: string }> {
  const config = v.config || {};
  const localItems: any[] = (config.items || []).map((item: any, idx: number) => {
    if (typeof item === 'object' && item !== null) {
      return {
        id: item.id || `item_${idx + 1}`,
        value: item.value !== undefined && item.value !== '' ? String(item.value) : (item.embeddedType ? item.embeddedType : `Item ${idx + 1}`),
      };
    }
    return { id: `item_${idx + 1}`, value: String(item) };
  });

  let inheritedItems: any[] = [];
  if (config.sourceListVariableId) {
    const parentVar = variables.find(pv => pv.id === config.sourceListVariableId || pv.name === config.sourceListVariableId);
    if (parentVar) {
      const parentItems: any[] = (parentVar.config?.items || []).map((item: any, idx: number) => {
        if (typeof item === 'object' && item !== null) {
          return {
            id: item.id || `item_${idx + 1}`,
            value: item.value !== undefined && item.value !== '' ? String(item.value) : `Item ${idx + 1}`,
          };
        }
        return { id: `item_${idx + 1}`, value: String(item) };
      });

      const selectionMode = config.sourceListSelectionMode || 'SUBSET_SPECIFIC';
      if (selectionMode === 'SUBSET_SPECIFIC' && config.selectedListItemIds && config.selectedListItemIds.length > 0) {
        inheritedItems = config.selectedListItemIds
          .map((id: string) => parentItems.find((p: any) => p.id === id || String(p.value) === id))
          .filter(Boolean);
      } else if (selectionMode === 'SUBSET_RANDOM') {
        const count = Math.min(Math.max(1, config.randomSubsetCount || 1), parentItems.length || 10);
        const parentName = parentVar.name || 'Parent List';
        inheritedItems = Array.from({ length: count }, (_, i) => ({
          id: `random_item_${i + 1}`,
          value: `Random Item ${i + 1} - ${parentName}`,
        }));
      } else if (selectionMode === 'FIXED_ITEM' && config.selectedListItemId) {
        const match = parentItems.find((p: any) => p.id === config.selectedListItemId || String(p.value) === config.selectedListItemId);
        inheritedItems = match ? [match] : [];
      } else {
        inheritedItems = parentItems;
      }
    }
  }

  let combined = [...inheritedItems, ...localItems];

  if (config.itemOrder && Array.isArray(config.itemOrder) && config.itemOrder.length > 0) {
    const orderMap = new Map(config.itemOrder.map((id: string, index: number) => [id, index]));
    combined.sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : (orderMap.has(String(a.value)) ? orderMap.get(String(a.value))! : 99999);
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : (orderMap.has(String(b.value)) ? orderMap.get(String(b.value))! : 99999);
      return idxA - idxB;
    });
  }

  return combined.map((item, idx) => ({
    id: item.id || `item_${idx}`,
    label: item.value ? String(item.value) : `Item ${idx + 1}`,
  }));
}

export function TemplateEditor({
  value,
  onChange,
  variables,
  flowId,
  groupId,
  className = '',
}: TemplateEditorProps) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const { actions } = useApp();

  // Parse variables for highlighting and validation
  const tokens = useMemo(() => {
    const parts: Array<{ text: string; isValid?: boolean; isVariable?: boolean }> = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(value)) !== null) {
      // Add text before variable
      if (match.index > lastIndex) {
        parts.push({ text: value.substring(lastIndex, match.index) });
      }

      const fullSpec = match[1].trim();
      const isSystem = ['uuid', 'ts', 'n'].includes(fullSpec);
      
      let isValid = false;
      if (isSystem) {
        isValid = true;
      } else {
        let scope: string | null = null;
        let name = fullSpec;
        let subProperty: string | null = null;
        let isItemAccess = false;

        if (fullSpec.includes('.')) {
          const parts = fullSpec.split('.');
          const knownScopes = ['local', 'group', 'global'];
          if (knownScopes.includes(parts[0].toLowerCase())) {
            scope = parts[0].toLowerCase();
            name = parts[1];
            if (parts.length >= 3) {
              subProperty = parts[2];
              if (subProperty.toLowerCase().startsWith('item')) {
                isItemAccess = true;
              }
            }
          } else {
            scope = null;
            name = parts[0];
            if (parts.length >= 2) {
              subProperty = parts[1];
              if (subProperty.toLowerCase().startsWith('item')) {
                isItemAccess = true;
              }
            }
          }
        }

        const variable = variables.find(v => {
          if (v.name !== name) return false;
          if (scope && v.scope !== scope) return false;
          
          if (v.scope === 'global') return true;
          if (v.scope === 'group') return v.groupId === groupId;
          if (v.scope === 'local') return v.flowId === flowId;
          
          return false;
        });
        
        if (variable) {
          if (isItemAccess && variable.type === 'list') {
            const strategy = variable.config?.selectionStrategy;
            if (strategy && strategy !== 'FIXED_SUBSET') {
              isValid = false;
            } else {
              isValid = true;
            }
          } else if (subProperty && variable.type === 'point') {
            const lowerProp = subProperty.toLowerCase();
            const validPointProps = [
              'latitude', 'longitude', 'altitude',
              'latitudedecimal', 'longitudedecimal',
              'altitudeunit', 'altitudereference',
              'x', 'y', 'z',
              'nodename', 'node_name', 'node', 'nodeid', 'node_id'
            ];
            isValid = validPointProps.includes(lowerProp);
          } else {
            isValid = true;
          }
        }
      }

      parts.push({ 
        text: match[0], 
        isValid, 
        isVariable: true 
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < value.length) {
      parts.push({ text: value.substring(lastIndex) });
    }

    return parts;
  }, [value, variables, flowId, groupId]);

  // Handle autocomplete logic
  const autocompleteOptions = useMemo(() => {
    if (!showAutocomplete) return [];

    const textBeforeCursor = value.substring(0, cursorPos);
    const lastBraces = textBeforeCursor.lastIndexOf('{{');
    if (lastBraces === -1) return [];

    const query = textBeforeCursor.substring(lastBraces + 2).trim().toLowerCase();
    
    const options: Array<{ name: string; scope: string; detail?: string }> = [
      { name: 'uuid', scope: 'system' },
      { name: 'ts', scope: 'system' },
      { name: 'n', scope: 'system' },
    ];

    const accessibleVars = variables.filter(v => {
      if (v.scope === 'global') return true;
      if (v.scope === 'group') return v.groupId === groupId;
      if (v.scope === 'local') return v.flowId === flowId;
      return false;
    });

    accessibleVars.forEach(v => {
      if (v.type === 'list') {
        const strategy = v.config?.selectionStrategy || 'FIXED_SUBSET';
        const isFixedSubset = strategy === 'FIXED_SUBSET';

        options.push({ 
          name: v.name, 
          scope: v.scope, 
          detail: isFixedSubset ? 'Fixed Subset / Entire List' : 'Single Item Selection' 
        });

        if (isFixedSubset) {
          const effectiveItems = getEffectiveListItems(v, variables);
          effectiveItems.forEach((item, index) => {
            options.push({
              name: `${v.name}.item${index}`,
              scope: v.scope,
              detail: `item${index} (${item.label})`,
            });
          });
        }
      } else if (v.type === 'point') {
        options.push({ name: v.name, scope: v.scope, detail: 'Full Point Object' });

        const coordSys = v.config?.coordinateSystem || 'CARTESIAN_2D';
        if (coordSys === 'GEOSPATIAL') {
          options.push({ name: `${v.name}.latitude`, scope: v.scope, detail: 'Latitude (Degrees / DMS)' });
          options.push({ name: `${v.name}.longitude`, scope: v.scope, detail: 'Longitude (Degrees / DMS)' });
          options.push({ name: `${v.name}.altitude`, scope: v.scope, detail: 'Altitude' });
        } else if (coordSys === 'CARTESIAN_3D') {
          options.push({ name: `${v.name}.x`, scope: v.scope, detail: 'X Coordinate' });
          options.push({ name: `${v.name}.y`, scope: v.scope, detail: 'Y Coordinate' });
          options.push({ name: `${v.name}.z`, scope: v.scope, detail: 'Z Coordinate' });
        } else {
          options.push({ name: `${v.name}.x`, scope: v.scope, detail: 'X Coordinate' });
          options.push({ name: `${v.name}.y`, scope: v.scope, detail: 'Y Coordinate' });
        }

        if (v.config?.pattern === 'GRAPH_ROUTE' || (v.config?.graphNodes && v.config.graphNodes.length > 0)) {
          options.push({ name: `${v.name}.nodeName`, scope: v.scope, detail: 'Graph Node Display Name' });
          options.push({ name: `${v.name}.nodeId`, scope: v.scope, detail: 'Graph Node ID' });
        }
      } else {
        options.push({ name: v.name, scope: v.scope });
      }
    });

    return options
      .filter(o => {
        const full = `${o.scope}.${o.name}`.toLowerCase();
        const simpleName = o.name.toLowerCase();
        return full.startsWith(query) || full.includes(query) || simpleName.startsWith(query) || simpleName.includes(query);
      });
  }, [showAutocomplete, value, cursorPos, variables, flowId, groupId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [autocompleteOptions.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (showAutocomplete && autocompleteOptions.length > 0) {
        insertOption(autocompleteOptions[selectedIndex]);
      } else {
        const start = textareaRef.current?.selectionStart || 0;
        const end = textareaRef.current?.selectionEnd || 0;
        const newValue = value.substring(0, start) + '  ' + value.substring(end);
        onChange(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(start + 2, start + 2);
          }
        }, 0);
      }
      return;
    }

    if (e.key === '{') {
      const start = textareaRef.current?.selectionStart || 0;
      const textBefore = value.substring(0, start);
      if (textBefore.endsWith('{')) {
        setShowAutocomplete(true);
        setCursorPos(start + 1);
      }
    }
  };

  const valueRef = useRef(value);
  valueRef.current = value;

  const insertOption = (opt: { name: string; scope: string }) => {
    const varRef = opt.scope === 'system' ? opt.name : `${opt.scope}.${opt.name}`;
    insertAtCursor(varRef);
    setShowAutocomplete(false);
  };

  const insertAtCursor = (varRef: string) => {
    const ta = textareaRef.current;
    const currentVal = valueRef.current;

    let start = ta ? ta.selectionStart : currentVal.length;
    let end = ta ? ta.selectionEnd : currentVal.length;
    const textBefore = currentVal.substring(0, start);
    
    // Check if we should replace a partially typed {{...
    // If textBefore ends with {{ or {{ + something, we replace from the {{ up to matching }}
    const lastOpen = textBefore.lastIndexOf('{{');
    let finalStart = start;
    let finalEnd = end;

    if (lastOpen !== -1 && lastOpen >= textBefore.lastIndexOf('}}')) {
      finalStart = lastOpen;
      const closingPos = currentVal.indexOf('}}', finalStart);
      if (closingPos !== -1 && closingPos >= start - 2) {
        finalEnd = closingPos + 2;
      }
    }
    
    const replacement = `{{${varRef}}}`;
    const newValue = currentVal.substring(0, finalStart) + replacement + currentVal.substring(finalEnd);
    
    onChange(newValue);
    
    // Set focus and cursor after insertion
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const newPos = finalStart + replacement.length;
        ta.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  useEffect(() => {
    actions?.registerTemplateEditor?.((name: string, scope?: string) => {
      const ref = scope ? `${scope}.${name}` : name;
      insertAtCursor(ref);
    });

    return () => {
      actions?.registerTemplateEditor?.(null);
    };
  }, [actions]);

  const handleFocus = () => {};

  const checkInsideBraces = (val: string, pos: number) => {
    const textBefore = val.substring(0, pos);
    const lastOpen = textBefore.lastIndexOf('{{');
    const lastClose = textBefore.lastIndexOf('}}');
    if (lastOpen !== -1 && lastOpen > lastClose) {
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
    }
  };

  const dropdownPosition = useMemo(() => {
    const textBefore = value.substring(0, cursorPos);
    const lines = textBefore.split('\n');
    const lineIndex = lines.length - 1;
    const charIndex = lines[lineIndex].length;
    return {
      top: `${Math.min(lineIndex * 21 + 32, 220)}px`,
      left: `${Math.min(Math.max(charIndex * 7.5 + 12, 12), 350)}px`,
    };
  }, [value, cursorPos]);

  const handleBlur = () => {
    // Small delay to allow clicking on autocomplete items
    setTimeout(() => {
      setShowAutocomplete(false);
    }, 150);
  };

  const editorStyles: React.CSSProperties = {
    fontFamily: 'JetBrains Mono, monospace',
    lineHeight: '1.6',
    fontSize: '13px',
    padding: '12px',
    margin: 0,
    border: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    letterSpacing: 'normal',
    wordSpacing: 'normal',
    tabSize: 2,
  };

  return (
    <div className={`relative group ${className}`} style={{ ...editorStyles, padding: 0 }}>
      {/* Highlighting Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-all overflow-auto text-transparent"
        style={{ ...editorStyles, scrollbarWidth: 'none' }}
      >
        {tokens.map((t, i) => (
          <span 
            key={i} 
            className={t.isVariable ? (t.isValid ? 'bg-emerald-500/20 text-emerald-400 rounded ring-1 ring-inset ring-emerald-500/40' : 'bg-red-500/20 text-red-400 rounded ring-1 ring-inset ring-red-500/40') : 'text-[var(--c-tx2)]'}
          >
            {t.text}
          </span>
        ))}
      </div>

      {/* Actual Input */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          const pos = e.target.selectionStart;
          onChange(val);
          setCursorPos(pos);
          checkInsideBraces(val, pos);
        }}
        onClick={(e) => {
          const pos = e.currentTarget.selectionStart;
          setCursorPos(pos);
          checkInsideBraces(e.currentTarget.value, pos);
        }}
        onKeyUp={(e) => {
          const pos = e.currentTarget.selectionStart;
          setCursorPos(pos);
          checkInsideBraces(e.currentTarget.value, pos);
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="w-full h-full bg-transparent text-transparent caret-[var(--c-tx1)] resize-none relative z-10 whitespace-pre-wrap break-all overflow-auto"
        spellCheck={false}
        style={editorStyles}
      />

      {/* Autocomplete Dropdown */}
      {showAutocomplete && autocompleteOptions.length > 0 && (
        <div 
          ref={autocompleteRef}
          className="absolute z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl min-w-[220px] max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--c-br3)]"
          style={{ 
            top: dropdownPosition.top, 
            left: dropdownPosition.left
          }}
        >
          {autocompleteOptions.map((opt, i) => (
            <div
              key={i}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur
                insertOption(opt);
              }}
              className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-4 transition-colors ${i === selectedIndex ? 'bg-violet-500/20 text-violet-400' : 'hover:bg-white/5 text-[var(--c-tx3)]'}`}
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold">{opt.name}</span>
                <span className="text-[10px] uppercase opacity-60 tracking-wider">
                  {opt.scope} {opt.detail ? `• ${opt.detail}` : ''}
                </span>
              </div>
              {opt.scope === 'local' && <span className="text-[8px] px-1 rounded bg-sky-500/10 text-sky-500 border border-sky-500/20">Local</span>}
              {opt.scope === 'group' && <span className="text-[8px] px-1 rounded bg-violet-500/10 text-violet-500 border border-violet-500/20">Group</span>}
              {opt.scope === 'global' && <span className="text-[8px] px-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">Global</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
