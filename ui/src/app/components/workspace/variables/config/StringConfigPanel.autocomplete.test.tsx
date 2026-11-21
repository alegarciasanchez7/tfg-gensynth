import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StringVariableConfig } from '../../../../types';
import { StringConfigPanel } from './StringConfigPanel';

vi.mock('../../../../context', () => ({
  useApp: () => ({
    state: {
      variables: [
        { id: 'a', name: 'alpha', scope: 'global', type: 'string' },
        { id: 'b', name: 'beta', scope: 'global', type: 'string' },
      ],
    },
  }),
}));

function Wrapper() {
  const [cfg, setCfg] = useState<StringVariableConfig>({ pattern: 'TEMPLATE', template: '' });
  return <StringConfigPanel config={cfg} onChange={(c) => setCfg(prev => ({ ...prev, ...c }))} />;
}

describe('StringConfigPanel template autocomplete', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('suggests variables after {{ and starts again from the first option when they change', () => {
    render(<Wrapper />);
    const input = screen.getByLabelText(/Dynamic Template String/i);
    fireEvent.change(input, { target: { value: '{{', selectionStart: 2 } });
    fireEvent.keyDown(input, { key: '{' });
    expect(screen.getAllByRole('option')).toHaveLength(2);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.change(input, { target: { value: '{{alp', selectionStart: 5 } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });
});
