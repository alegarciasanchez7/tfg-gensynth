import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Binary } from 'lucide-react';
import type { SetStateAction } from 'react';
import type { VariableDraft } from './useVariableEditor';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn(() => ({ state: { variables: [] } })) }));
vi.mock('../../../context', () => ({ useApp: () => mockUseApp() }));

import { VariableEditorConfigCard } from './VariableEditorSections';

const theme = { icon: Binary, description: '', accent: '', border: '' };

describe('VariableEditorConfigCard', () => {
  afterEach(cleanup);

  it('keeps every quick edit even when the card has not re-rendered in between', () => {
    const draft: VariableDraft = {
      name: 'temp', type: 'numeric', scope: 'local', description: '',
      configText: JSON.stringify({ min: 0, max: 100, pattern: 'RANDOM' }),
    };
    // A mock setter never re-renders, like two keystrokes handled before React commits
    const updates: Array<SetStateAction<VariableDraft>> = [];
    render(<VariableEditorConfigCard typeLabel="Numeric" theme={theme} draft={draft} setDraft={u => updates.push(u)} />);

    fireEvent.change(screen.getByTestId('numeric-min-input'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('numeric-max-input'), { target: { value: '50' } });

    const result = updates.reduce<VariableDraft>(
      (current, update) => (typeof update === 'function' ? update(current) : update), draft);
    expect(JSON.parse(result.configText)).toMatchObject({ min: 5, max: 50, pattern: 'RANDOM' });
  });
});
