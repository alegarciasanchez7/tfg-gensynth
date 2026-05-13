import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Variable } from '../../../types';

interface TemplateEditorProps {
  value: string;
  onChange: (val: string) => void;
  variables: Variable[];
  flowId: string;
  groupId: string;
  className?: string;
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
        const dotIndex = fullSpec.indexOf('.');
        const scope = dotIndex !== -1 ? fullSpec.substring(0, dotIndex).toLowerCase() : null;
        const name = dotIndex !== -1 ? fullSpec.substring(dotIndex + 1) : fullSpec;

        const variable = variables.find(v => v.name === name && (!scope || v.scope === scope));
        
        if (variable) {
          if (variable.scope === 'global') isValid = true;
          else if (variable.scope === 'group') isValid = variable.groupId === groupId;
          else if (variable.scope === 'local') isValid = variable.flowId === flowId;
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

    const query = textBeforeCursor.substring(lastBraces + 2).toLowerCase();
    
    // Filter variables that are at least potentially valid (system + current scope)
    const options = [
      { name: 'uuid', scope: 'system' },
      { name: 'ts', scope: 'system' },
      { name: 'n', scope: 'system' },
      ...variables
        .filter(v => {
          if (v.scope === 'global') return true;
          if (v.scope === 'group') return v.groupId === groupId;
          if (v.scope === 'local') return v.flowId === flowId;
          return false;
        })
        .map(v => ({ name: v.name, scope: v.scope }))
    ];

    return options
      .filter(o => {
        const full = `${o.scope}.${o.name}`.toLowerCase();
        return full.includes(query) || o.name.toLowerCase().includes(query);
      })
      .slice(0, 8);
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
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertOption(autocompleteOptions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === '{') {
      const textBefore = value.substring(0, textareaRef.current?.selectionStart || 0);
      if (textBefore.endsWith('{')) {
        setShowAutocomplete(true);
        setCursorPos((textareaRef.current?.selectionStart || 0) + 1);
      }
    }
  };

  const insertOption = (opt: { name: string; scope: string }) => {
    const start = textareaRef.current?.selectionStart || 0;
    const textBefore = value.substring(0, start);
    const lastBraces = textBefore.lastIndexOf('{{');
    
    const replacement = opt.scope === 'system' ? opt.name : `${opt.scope}.${opt.name}`;
    const newValue = value.substring(0, lastBraces + 2) + replacement + '}}' + value.substring(start);
    
    onChange(newValue);
    setShowAutocomplete(false);
    
    // Set focus and cursor after insertion
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = lastBraces + 2 + replacement.length + 2;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  return (
    <div className={`relative font-mono text-sm group ${className}`}>
      {/* Highlighting Overlay */}
      <div 
        className="absolute inset-0 p-3 pointer-events-none whitespace-pre-wrap break-all overflow-auto text-transparent"
        style={{ scrollbarWidth: 'none' }}
      >
        {tokens.map((t, i) => (
          <span 
            key={i} 
            className={t.isVariable ? (t.isValid ? 'bg-emerald-500/20 text-emerald-400 rounded px-0.5 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 rounded px-0.5 border border-red-500/30') : 'text-[var(--c-tx2)]'}
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
          onChange(e.target.value);
          setCursorPos(e.target.selectionStart);
          if (showAutocomplete && !e.target.value.substring(0, e.target.selectionStart).includes('{{')) {
            setShowAutocomplete(false);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
        className="w-full h-full p-3 bg-transparent text-transparent caret-[var(--c-tx1)] resize-none border-none outline-none focus:ring-0 relative z-10 whitespace-pre-wrap break-all overflow-auto"
        spellCheck={false}
      />

      {/* Autocomplete Dropdown */}
      {showAutocomplete && autocompleteOptions.length > 0 && (
        <div 
          ref={autocompleteRef}
          className="absolute z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl min-w-[200px] overflow-hidden"
          style={{ 
            top: '20px', // Simplified positioning, for real we'd need cursor coords
            left: '20px'
          }}
        >
          {autocompleteOptions.map((opt, i) => (
            <div
              key={i}
              onClick={() => insertOption(opt)}
              className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-4 transition-colors ${i === selectedIndex ? 'bg-violet-500/20 text-violet-400' : 'hover:bg-white/5 text-[var(--c-tx3)]'}`}
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold">{opt.name}</span>
                <span className="text-[10px] uppercase opacity-60 tracking-wider">{opt.scope}</span>
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
