import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTextEditingTarget, resolveDiscardTarget, useKeyboardShortcuts } from './useKeyboardShortcuts';
import { createEmptyDirtyItems } from '../helpers/dirtyStateHelper';

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  const onSave = vi.fn();
  const onDiscard = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    renderHook(() => useKeyboardShortcuts({ onSave, onDiscard }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('saves on Ctrl+S and Cmd+S, preventing the browser save dialog', () => {
    const event = press('s');
    press('S', { ctrlKey: false, metaKey: true });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(event.defaultPrevented).toBe(true);
  });

  it('discards on Ctrl+Z', () => {
    const event = press('z');
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps the native undo inside text fields', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    document.body.append(input, textarea);

    const event = press('z', {}, input);
    press('z', {}, textarea);

    expect(onDiscard).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not discard while a dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);

    press('z');

    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('ignores other combinations', () => {
    press('z', { shiftKey: true });
    press('z', { ctrlKey: false });
    press('s', { altKey: true });

    expect(onDiscard).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('isTextEditingTarget', () => {
  it('treats text inputs and textareas as text fields, but not checkboxes or buttons', () => {
    const text = document.createElement('input');
    const number = Object.assign(document.createElement('input'), { type: 'number' });
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    expect(isTextEditingTarget(text)).toBe(true);
    expect(isTextEditingTarget(number)).toBe(true);
    expect(isTextEditingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTextEditingTarget(checkbox)).toBe(false);
    expect(isTextEditingTarget(document.createElement('button'))).toBe(false);
    expect(isTextEditingTarget(window)).toBe(false);
  });
});

describe('resolveDiscardTarget', () => {
  const dirty = createEmptyDirtyItems();
  dirty.groupIds.add('g1');
  dirty.flowIds.add('f1');
  dirty.variableIds.add('v1');

  it('targets the selected item when it has unsaved changes', () => {
    expect(resolveDiscardTarget({ type: 'group', groupId: 'g1' }, dirty, true)).toEqual({ type: 'group', id: 'g1' });
    expect(resolveDiscardTarget({ type: 'flow', groupId: 'g1', flowId: 'f1' }, dirty, true)).toEqual({ type: 'flow', id: 'f1' });
    expect(resolveDiscardTarget({ type: 'variable', groupId: 'g1', variableId: 'v1' }, dirty, true)).toEqual({ type: 'variable', id: 'v1' });
  });

  it('does nothing for a selected item without changes', () => {
    expect(resolveDiscardTarget({ type: 'flow', groupId: 'g1', flowId: 'f2' }, dirty, true)).toBeNull();
  });

  it('targets every change when nothing is selected', () => {
    expect(resolveDiscardTarget({ type: 'none' }, dirty, true)).toBe('all');
    expect(resolveDiscardTarget({ type: 'none' }, createEmptyDirtyItems(), false)).toBeNull();
  });
});
