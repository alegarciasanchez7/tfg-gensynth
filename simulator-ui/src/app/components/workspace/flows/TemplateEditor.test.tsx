import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateEditor } from './TemplateEditor';
import type { Variable } from '../../../types';

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock('../../../context', () => ({
  useApp: () => mockUseApp(),
}));

describe('TemplateEditor', () => {
  const mockActions = {
    registerTemplateEditor: vi.fn(),
  };

  const mockVariables: Variable[] = [
    {
      id: 'v1',
      name: 'vegetables_7',
      scope: 'local',
      type: 'list',
      flowId: 'f1',
      groupId: 'g1',
      config: {
        selectionStrategy: 'FIXED_SUBSET',
        items: [
          { id: 'i1', value: 'Carrot' },
          { id: 'i2', value: 'Onion' },
        ],
      },
    },
  ];

  beforeEach(() => {
    cleanup();
    mockUseApp.mockReturnValue({ state: {}, actions: mockActions });
  });

  it('renders textarea with value and triggers autocompletion when typing dot after list variable', () => {
    const onChange = vi.fn();
    render(
      <TemplateEditor
        value='{"veg": {{local.vegetables_7.'
        onChange={onChange}
        variables={mockVariables}
        flowId="f1"
        groupId="g1"
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('{"veg": {{local.vegetables_7.');

    fireEvent.keyUp(textarea, { target: { selectionStart: textarea.value.length } });

    // Autocomplete dropdown should display items
    expect(screen.getByText('vegetables_7.item0')).toBeDefined();
    expect(screen.getByText('vegetables_7.item1')).toBeDefined();
  });

  it('replaces partial variable tag cleanly when registered editor callback is invoked', () => {
    let registeredCallback: ((name: string, scope?: string) => void) | null = null;
    mockActions.registerTemplateEditor.mockImplementation((cb: any) => {
      registeredCallback = cb;
    });

    const onChange = vi.fn();
    render(
      <TemplateEditor
        value='{"veg": {{local.vegetables_7.item0}}'
        onChange={onChange}
        variables={mockVariables}
        flowId="f1"
        groupId="g1"
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    expect(registeredCallback).not.toBeNull();
    textarea.selectionStart = 15;
    textarea.selectionEnd = 15;

    // Simulate clicking "Insert into template" arrow button on vegetables_7
    registeredCallback!('vegetables_7', 'local');

    expect(onChange).toHaveBeenCalledWith('{"veg": {{local.vegetables_7}}');
  });

  it('marks sub-item access tag as invalid when list variable uses WEIGHTED_RANDOM strategy', () => {
    const nonFixedVariables: Variable[] = [
      {
        id: 'v1',
        name: 'vegetables_7',
        scope: 'local',
        type: 'list',
        flowId: 'f1',
        groupId: 'g1',
        config: {
          selectionStrategy: 'WEIGHTED_RANDOM',
          items: [{ id: 'i1', value: 'Carrot' }],
        },
      },
    ];

    const { container } = render(
      <TemplateEditor
        value='{"veg": {{local.vegetables_7.item0}}}'
        onChange={vi.fn()}
        variables={nonFixedVariables}
        flowId="f1"
        groupId="g1"
      />
    );

    // Invalid variable tag should be highlighted with red styling
    const invalidTag = container.querySelector('.bg-red-500\\/20');
    expect(invalidTag).not.toBeNull();
    expect(invalidTag?.textContent).toBe('{{local.vegetables_7.item0}}');
  });
});

