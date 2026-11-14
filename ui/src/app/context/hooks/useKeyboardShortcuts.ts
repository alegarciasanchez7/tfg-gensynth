import { useEffect, useRef } from 'react';
import type { Selection } from '../../types';
import type { DirtyItems } from '../helpers/dirtyStateHelper';
import type { DiscardItemType } from '../actions/discardActions';

export interface KeyboardShortcutHandlers {
  /** Ctrl/Cmd + S */
  onSave: () => void;
  /** Ctrl/Cmd + Z outside text fields and dialogs */
  onDiscard: () => void;
}

/** What Ctrl+Z discards: one item, every unsaved change, or nothing. */
export type DiscardTarget = { type: DiscardItemType; id: string } | 'all' | null;

const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/**
 * Whether the event target is a text field, where Ctrl+Z must keep its native undo behaviour.
 */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(target.type);
}

function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/**
 * Decides what Ctrl+Z discards: the selected group/flow/variable when it has unsaved changes,
 * or every change of the project when nothing is selected.
 */
export function resolveDiscardTarget(selection: Selection, dirtyItems: DirtyItems, isDirty: boolean): DiscardTarget {
  switch (selection.type) {
    case 'variable':
      return selection.variableId && dirtyItems.variableIds.has(selection.variableId)
        ? { type: 'variable', id: selection.variableId }
        : null;
    case 'flow':
      return selection.flowId && dirtyItems.flowIds.has(selection.flowId) ? { type: 'flow', id: selection.flowId } : null;
    case 'group':
      return selection.groupId && dirtyItems.groupIds.has(selection.groupId) ? { type: 'group', id: selection.groupId } : null;
    default:
      return isDirty ? 'all' : null;
  }
}

/**
 * Global keyboard shortcuts: Ctrl/Cmd+S saves, Ctrl/Cmd+Z discards (see {@link resolveDiscardTarget}).
 * Ctrl+Z is ignored inside text fields (native undo) and while a dialog is open.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.repeat) return;
      const key = event.key.toLowerCase();

      if (key === 's') {
        // Always take over Ctrl+S so the browser does not open "Save page as"
        event.preventDefault();
        handlersRef.current.onSave();
      } else if (key === 'z' && !isTextEditingTarget(event.target) && !isDialogOpen()) {
        event.preventDefault();
        handlersRef.current.onDiscard();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
