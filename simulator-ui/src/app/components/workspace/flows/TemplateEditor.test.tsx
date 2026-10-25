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

  it('accepts the flow.name built-in and offers it in the autocomplete', () => {
    const { container } = render(
      <TemplateEditor
        value='{"id": "{{flow.name}}", "x": {{flo'
        onChange={vi.fn()}
        variables={mockVariables}
        flowId="f1"
        groupId="g1"
      />
    );

    expect(container.querySelector('.bg-red-500\\/20')).toBeNull();

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyUp(textarea, { target: { selectionStart: textarea.value.length } });
    expect(screen.getByText(/Name of this flow/)).toBeDefined();
  });
  /** Opens the autocomplete for a template ending in `{{` + the given query. */
  const openAutocomplete = (query: string, variables: Variable[]) => {
    render(
      <TemplateEditor
        value={`{"x": {{${query}`}
        onChange={vi.fn()}
        variables={variables}
        flowId="f1"
        groupId="g1"
      />
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.keyUp(textarea, { target: { selectionStart: textarea.value.length } });
  };

  const listVariable = (config: Variable['config']): Variable[] => [
    { id: 'v1', name: 'veg', scope: 'local', type: 'list', flowId: 'f1', groupId: 'g1', config },
  ];

  it('offers .size/.first/.last for a Fixed Subset list', () => {
    openAutocomplete('veg', listVariable({ selectionStrategy: 'FIXED_SUBSET', items: [{ id: 'i1', value: 'A' }] }));
    expect(screen.getByText('veg.size')).toBeDefined();
    expect(screen.getByText('veg.first')).toBeDefined();
    expect(screen.getByText('veg.last')).toBeDefined();
    expect(screen.getByText('veg.item0')).toBeDefined();
  });

  it('does not offer .size/.first/.last for a Weighted Random list', () => {
    openAutocomplete('veg', listVariable({ selectionStrategy: 'WEIGHTED_RANDOM', items: [{ id: 'i1', value: 'A' }] }));
    expect(screen.getByText('veg')).toBeDefined();
    expect(screen.queryByText('veg.size')).toBeNull();
    expect(screen.queryByText('veg.first')).toBeNull();
    expect(screen.queryByText('veg.last')).toBeNull();
    expect(screen.queryByText('veg.item0')).toBeNull();
  });

  it('treats a list without a strategy as Weighted Random', () => {
    openAutocomplete('veg', listVariable({ items: [{ id: 'i1', value: 'A' }] }));
    expect(screen.getByText(/Single Item Selection/)).toBeDefined();
    expect(screen.queryByText('veg.size')).toBeNull();
    expect(screen.queryByText('veg.item0')).toBeNull();
  });

  it('marks item access as invalid on a list without a strategy', () => {
    const { container } = render(
      <TemplateEditor
        value="{{local.veg.item0}} {{local.veg.size}}"
        onChange={vi.fn()}
        variables={listVariable({ items: [{ id: 'i1', value: 'A' }] })}
        flowId="f1"
        groupId="g1"
      />
    );
    const invalid = container.querySelectorAll('.bg-red-500\\/20');
    expect(invalid).toHaveLength(1);
    expect(invalid[0].textContent).toBe('{{local.veg.item0}}');
  });

  it('offers x/y/z for a point without a coordinate system (3D default)', () => {
    openAutocomplete('pos', [
      { id: 'p1', name: 'pos', scope: 'local', type: 'point', flowId: 'f1', groupId: 'g1', config: {} },
    ]);
    expect(screen.getByText('pos.x')).toBeDefined();
    expect(screen.getByText('pos.y')).toBeDefined();
    expect(screen.getByText('pos.z')).toBeDefined();
  });

  it('filters by what the user typed: {{te + Enter inserts the variable, not {{uuid}}', () => {
    const onChange = vi.fn();
    const variables: Variable[] = [
      { id: 't1', name: 'temperature', scope: 'local', type: 'numeric', flowId: 'f1', groupId: 'g1', config: {} },
    ];
    render(<TemplateEditor value={'{"x": {{te'} onChange={onChange} variables={variables} flowId="f1" groupId="g1" />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyUp(textarea);

    const options = screen.getAllByRole('option').map((o) => o.querySelector('span')?.textContent);
    expect(options[0]).toBe('temperature');
    expect(options).not.toContain('uuid');

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('{"x": {{local.temperature}}');
  });

  it('offers the documented sub-properties the Core supports', () => {
    openAutocomplete('', [
      { id: 'n', name: 'num', scope: 'local', type: 'numeric', flowId: 'f1', groupId: 'g1', config: {} },
      { id: 's', name: 'str', scope: 'local', type: 'string', flowId: 'f1', groupId: 'g1', config: {} },
      { id: 'b', name: 'flag', scope: 'local', type: 'boolean', flowId: 'f1', groupId: 'g1', config: {} },
      { id: 'd', name: 'when', scope: 'local', type: 'temporal', flowId: 'f1', groupId: 'g1', config: {} },
    ]);
    for (const option of [
      'num.floor', 'num.ceil', 'num.sign',
      'str.trim', 'str.firstChar', 'str.lastChar',
      'flag.asString', 'flag.upper',
      'when.monthShort', 'when.dayOfWeekNumber', 'when.hour', 'when.minute', 'when.second', 'when.timezone',
    ]) {
      expect(screen.getByText(option)).toBeDefined();
    }
  });

  it('highlights an unscoped sub-property against the closest variable', () => {
    const { container } = render(
      <TemplateEditor
        value="{{temp.round}} {{route.targetNodeName}}"
        onChange={vi.fn()}
        variables={[
          { id: 'g', name: 'temp', scope: 'global', type: 'string', config: {} },
          { id: 'l', name: 'temp', scope: 'local', type: 'numeric', flowId: 'f1', groupId: 'g1', config: {} },
          { id: 'p', name: 'route', scope: 'local', type: 'point', flowId: 'f1', groupId: 'g1', config: { pattern: 'GRAPH_ROUTE' } },
        ]}
        flowId="f1"
        groupId="g1"
      />
    );
    expect(container.querySelector('.bg-red-500\\/20')).toBeNull();
    expect(container.querySelectorAll('.bg-emerald-500\\/20')).toHaveLength(2);
  });

  it('inserts a variable typed on a new line in the middle without deleting the lines below', () => {
    const onChange = vi.fn();
    const variables: Variable[] = [
      { id: 'p1', name: 'puntito', scope: 'local', type: 'point', flowId: 'f1', groupId: 'g1', config: {} },
      { id: 't1', name: 'time', scope: 'global', type: 'temporal', config: {} },
    ];
    const before = '{\n  "num": {{local.num}},\n  "posicion": {{pun';
    const after = '\n  "time": {{global.time}}\n}';
    render(<TemplateEditor value={before + after} onChange={onChange} variables={variables} flowId="f1" groupId="g1" />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(before.length, before.length);
    fireEvent.keyUp(textarea);

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('{\n  "num": {{local.num}},\n  "posicion": {{local.puntito}}' + after);
  });

  it('completes a placeholder whose closing braces are already typed', () => {
    const onChange = vi.fn();
    const variables: Variable[] = [
      { id: 't1', name: 'temperature', scope: 'local', type: 'numeric', flowId: 'f1', groupId: 'g1', config: {} },
    ];
    render(<TemplateEditor value={'{"x": {{te}}, "y": {{uuid}}}'} onChange={onChange} variables={variables} flowId="f1" groupId="g1" />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    textarea.setSelectionRange(10, 10);
    fireEvent.keyUp(textarea);

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('{"x": {{local.temperature}}, "y": {{uuid}}}');
  });
});
