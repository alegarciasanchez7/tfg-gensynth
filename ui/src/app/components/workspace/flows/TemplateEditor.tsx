import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useApp } from '../../../context';
import type { Variable } from '../../../types';
import {
  autocompleteQuery,
  buildAutocompleteOptions,
  filterAutocompleteOptions,
  optionReference,
  type AutocompleteOption,
} from './templateAutocomplete';
import { tokenizeTemplate } from './templateTokens';

interface TemplateEditorProps {
  value: string;
  onChange: (val: string) => void;
  variables: Variable[];
  flowId: string;
  groupId: string;
  className?: string;
}

/** Highlight classes of a template token: plain text, a valid placeholder or an invalid one. */
function tokenClassName(token: { isValid?: boolean; isVariable?: boolean }): string {
  if (!token.isVariable) return 'text-[var(--c-tx2)]';
  return token.isValid
    ? 'bg-emerald-500/20 text-emerald-400 rounded ring-1 ring-inset ring-emerald-500/40'
    : 'bg-red-500/20 text-red-400 rounded ring-1 ring-inset ring-red-500/40';
}

export function TemplateEditor({
  value,
  onChange,
  variables,
  flowId,
  groupId,
  className = '',
}: Readonly<TemplateEditorProps>) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const { actions } = useApp();

  // Parse variables for highlighting and validation
  const tokens = useMemo(
    () => tokenizeTemplate(value, variables, flowId, groupId),
    [value, variables, flowId, groupId],
  );

  // Handle autocomplete logic
  const autocompleteOptions = useMemo(() => {
    if (!showAutocomplete) return [];
    const query = autocompleteQuery(value, cursorPos);
    if (query === null) return [];
    return filterAutocompleteOptions(buildAutocompleteOptions(variables, flowId, groupId), query);
  }, [showAutocomplete, value, cursorPos, variables, flowId, groupId]);

  // A new list of options selects its first one again (adjusting state while rendering)
  const [optionCount, setOptionCount] = useState(autocompleteOptions.length);
  if (optionCount !== autocompleteOptions.length) {
    setOptionCount(autocompleteOptions.length);
    setSelectedIndex(0);
  }

  const autocompleteOpen = showAutocomplete && autocompleteOptions.length > 0;

  /** Keys of the open autocomplete list; returns whether the key was handled. */
  const handleAutocompleteKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const count = autocompleteOptions.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % count);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + count) % count);
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      insertOption(autocompleteOptions[selectedIndex]);
      return true;
    }
    if (e.key === 'Escape') {
      setShowAutocomplete(false);
      return true;
    }
    return false;
  };

  /** Tab without the autocomplete: inserts two spaces at the cursor. */
  const insertIndent = () => {
    const start = textareaRef.current?.selectionStart || 0;
    const end = textareaRef.current?.selectionEnd || 0;
    const newValue = value.substring(0, start) + '  ' + value.substring(end);
    onChange(newValue);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(start + 2, start + 2);
      }
    }, 0);
  };

  /** A second `{` typed right after another one opens the autocomplete. */
  const openAutocompleteOnBraces = () => {
    const start = textareaRef.current?.selectionStart || 0;
    const textBefore = value.substring(0, start);
    if (textBefore.endsWith('{')) {
      setShowAutocomplete(true);
      setCursorPos(start + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocompleteOpen && handleAutocompleteKey(e)) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (autocompleteOpen) {
        insertOption(autocompleteOptions[selectedIndex]);
      } else {
        insertIndent();
      }
      return;
    }
    if (e.key === '{') openAutocompleteOnBraces();
  };

  const insertOption = (opt: AutocompleteOption) => {
    insertAtCursor(optionReference(opt));
    setShowAutocomplete(false);
  };

  const insertAtCursor = (varRef: string) => {
    const ta = textareaRef.current;
    const currentVal = value;

    const start = ta ? ta.selectionStart : currentVal.length;
    const end = ta ? ta.selectionEnd : currentVal.length;
    const textBefore = currentVal.substring(0, start);
    
    // Check if we should replace a partially typed {{...
    // If textBefore ends with {{ or {{ + something, we replace from the {{ up to matching }}
    const lastOpen = textBefore.lastIndexOf('{{');
    let finalStart = start;
    let finalEnd = end;

    if (lastOpen !== -1 && lastOpen >= textBefore.lastIndexOf('}}')) {
      finalStart = lastOpen;
      // Only the }} that closes this placeholder (the rest of its name, then }}). A placeholder
      // still being typed has none: the next }} belongs to another placeholder further on, and
      // replacing up to it would delete the text in between
      const closing = /^[\w.]*\s*\}\}/.exec(currentVal.substring(end));
      if (closing) {
        finalEnd = end + closing[0].length;
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

  // The callback registered in the context always runs the latest insertAtCursor (current value,
  // onChange and cursor), although it is registered only once per actions object
  const insertAtCursorRef = useRef(insertAtCursor);
  useLayoutEffect(() => {
    insertAtCursorRef.current = insertAtCursor;
  });

  useEffect(() => {
    actions?.registerTemplateEditor?.((name: string, scope?: string) => {
      const ref = scope ? `${scope}.${name}` : name;
      insertAtCursorRef.current(ref);
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
        {tokens.map((t) => (
          <span 
            key={t.start} 
            className={tokenClassName(t)}
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
          role="listbox"
          aria-label="Template suggestions"
          className="absolute z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl min-w-[220px] max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--c-br3)]"
          style={{ 
            top: dropdownPosition.top, 
            left: dropdownPosition.left
          }}
        >
          {autocompleteOptions.map((opt, i) => (
            <div
              key={`${opt.scope}.${opt.name}`}
              role="option"
              aria-selected={i === selectedIndex}
              tabIndex={-1}
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
