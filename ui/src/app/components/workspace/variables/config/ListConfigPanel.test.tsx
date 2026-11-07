import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { ListConfigPanel } from './ListConfigPanel';
import { ListVariableConfig } from '../../../../types';

// A GLOBAL list a variable could inherit from
const otherList = {
  id: 'other', name: 'other', scope: 'global', type: 'list',
  config: { items: [{ id: 'p1', value: 'P1', weight: 1 }] },
};

// Picking Dynamic Generator opens the generator editor, whose panels read the app state
vi.mock('../../../../context', () => ({
  useApp: () => ({ state: { variables: [otherList], groups: [], flows: [] } }),
}));

/** The panel inside an editor that keeps its changes, so several edits can follow each other. */
function EditedList({ initial, onConfig }: { initial: ListVariableConfig; onConfig: (config: ListVariableConfig) => void }) {
  const [config, setConfig] = useState(initial);
  onConfig(config);
  return <ListConfigPanel config={config} onChange={(patch) => setConfig(current => ({ ...current, ...patch }))} />;
}

const rowSums = (matrix: Record<string, Record<string, number>> = {}) =>
  Object.fromEntries(Object.entries(matrix).map(([from, row]) => [from, Object.values(row).reduce((a, p) => a + p, 0)]));

describe('ListConfigPanel', () => {
  beforeAll(() => {
    // Radix tooltips of the item generator panels measure their trigger; jsdom has no ResizeObserver
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  const defaultConfig: ListVariableConfig = {
    selectionStrategy: 'WEIGHTED_RANDOM',
    items: [
      { id: 'item1', value: 'Item A', weight: 1.0 },
      { id: 'item2', value: 'Item B', weight: 2.5 }
    ]
  };

  it('renders input fields with initial config values', () => {
    render(<ListConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    const valueInputs = screen.getAllByPlaceholderText(/Value \(Literal\)/i);
    expect(valueInputs).toHaveLength(2);
    expect(valueInputs[0]).toHaveValue('Item A');
    expect(valueInputs[1]).toHaveValue('Item B');

    const weightInputs = screen.getAllByPlaceholderText(/Weight/i);
    expect(weightInputs).toHaveLength(2);
    expect(weightInputs[0]).toHaveValue(1);
    expect(weightInputs[1]).toHaveValue(2.5);
  });

  it('calls onChange when selection strategy is changed', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    // Open dropdown
    const dropdownBtn = document.getElementById('selection-strategy-select')!;
    fireEvent.click(dropdownBtn);

    // Click Markov Chain option
    const markovOpt = screen.getByRole('option', { name: /Markov Chain/i });
    fireEvent.click(markovOpt);

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      selectionStrategy: 'MARKOV_CHAIN'
    }));
  });

  it('lets the last item switch to a Dynamic Generator (menu not clipped by the item list)', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    const modeTriggers = screen.getAllByRole('button', { name: /^Literal$/ });
    fireEvent.click(modeTriggers[modeTriggers.length - 1]);
    const option = screen.getByRole('option', { name: /Dynamic Generator/ });
    // Rendered outside the scrollable item list, which clips its overflow
    expect(option.closest('.overflow-y-auto.max-h-80')).toBeNull();
    fireEvent.click(option);

    const items = handleChange.mock.calls[0][0].items;
    expect(items[1]).toMatchObject({ id: 'item2', isEmbedded: true });
  });

  it('starts a generator from the new type defaults when its type changes', () => {
    const handleChange = vi.fn();
    const config: ListVariableConfig = {
      items: [{ id: 'item1', isEmbedded: true, embeddedType: 'numeric', embeddedConfig: { min: 0, max: 100, precision: 'INTEGER' } }],
    };
    render(<ListConfigPanel config={config} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: /^Numeric$/ }));
    fireEvent.click(screen.getByRole('option', { name: /^Boolean$/ }));

    expect(handleChange.mock.calls[0][0].items[0]).toMatchObject({
      embeddedType: 'boolean',
      embeddedConfig: { pattern: 'CONSTANT_BOOLEAN', currentValue: false },
    });
  });

  it('calls onChange when Add Item is clicked', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    const addButton = screen.getByRole('button', { name: /Add Item/i });
    fireEvent.click(addButton);

    expect(handleChange).toHaveBeenCalled();
  });

  it('displays Markov Chain matrix editor when MARKOV_CHAIN strategy is selected', () => {
    const markovConfig: ListVariableConfig = {
      selectionStrategy: 'MARKOV_CHAIN',
      items: [
        { id: 'item1', value: 'State A' },
        { id: 'item2', value: 'State B' }
      ]
    };

    render(<ListConfigPanel config={markovConfig} onChange={vi.fn()} />);

    expect(screen.getByText(/Markov Transition Probability Matrix/i)).toBeInTheDocument();
  });

  it('keeps the decimal point while typing a Markov probability', () => {
    const handleChange = vi.fn();
    const markovConfig: ListVariableConfig = {
      selectionStrategy: 'MARKOV_CHAIN',
      items: [
        { id: 'item1', value: 'State A' },
        { id: 'item2', value: 'State B' }
      ],
      transitionMatrix: { item1: { item1: 0.5, item2: 0.5 }, item2: { item1: 0.5, item2: 0.5 } },
    };
    render(<ListConfigPanel config={markovConfig} onChange={handleChange} />);

    const cell = screen.getAllByLabelText('Transition probability')[0];
    fireEvent.focus(cell);
    fireEvent.change(cell, { target: { value: '0.' } });
    expect(cell).toHaveValue('0.');
    expect(handleChange).not.toHaveBeenCalled();

    fireEvent.change(cell, { target: { value: '0.7' } });
    expect(cell).toHaveValue('0.7');
    expect(handleChange).toHaveBeenLastCalledWith({
      transitionMatrix: expect.objectContaining({ item1: expect.objectContaining({ item1: 0.7 }) }),
    });
  });

  it('commits a Markov probability only once the typed text is a complete decimal', () => {
    const handleChange = vi.fn();
    const markovConfig: ListVariableConfig = {
      selectionStrategy: 'MARKOV_CHAIN',
      items: [{ id: 'item1', value: 'State A' }, { id: 'item2', value: 'State B' }],
      transitionMatrix: { item1: { item1: 0.5, item2: 0.5 }, item2: { item1: 0.5, item2: 0.5 } },
    };
    render(<ListConfigPanel config={markovConfig} onChange={handleChange} />);
    const cell = screen.getAllByLabelText('Transition probability')[0];
    fireEvent.focus(cell);

    // Same cases accepted and rejected by the former /^\d*\.?\d+$/ check
    const cases: Array<[string, boolean]> = [
      ['1', true], ['0.25', true], ['.5', true], [',75', true], ['10.0', true],
      ['', false], ['0.', false], ['.', false], ['1.2.3', false], ['-1', false], ['abc', false], ['1e3', false], [' 1', false],
    ];
    for (const [text, commits] of cases) {
      handleChange.mockClear();
      fireEvent.change(cell, { target: { value: text } });
      expect(handleChange.mock.calls.length > 0, `"${text}"`).toBe(commits);
    }
  });

  it('shows long default probabilities rounded', () => {
    const markovConfig: ListVariableConfig = {
      selectionStrategy: 'MARKOV_CHAIN',
      items: [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }, { id: 'c', value: 'C' }],
      transitionMatrix: { a: { a: 1 / 3 } },
    };
    render(<ListConfigPanel config={markovConfig} onChange={vi.fn()} />);

    const cells = screen.getAllByLabelText('Transition probability');
    expect(cells[0]).toHaveValue('0.333');
    // Cells missing from the matrix are 0 for the Core, so they show 0
    expect(cells[1]).toHaveValue('0');
  });

  it('renders selection strategy info tooltip icon with accessibility label', () => {
    render(<ListConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    const infoButton = screen.getByRole('button', { name: /Selection strategy info/i });
    expect(infoButton).toBeInTheDocument();
  });

  it('keeps every Markov row adding up to 1 when items are added and removed', () => {
    let config: ListVariableConfig = {};
    render(<EditedList initial={{ selectionStrategy: 'MARKOV_CHAIN', items: [] }} onConfig={(c) => { config = c; }} />);
    const addItem = () => fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

    addItem();
    addItem();
    addItem();
    expect(rowSums(config.transitionMatrix)).toEqual({ item_1: 1, item_2: 1, item_3: 1 });
    expect(config.transitionMatrix?.item_1.item_3).toBeCloseTo(1 / 3);

    fireEvent.click(screen.getAllByTitle('Delete Item')[1]);
    expect(Object.keys(config.transitionMatrix ?? {})).toEqual(['item_1', 'item_3']);
    expect(Object.keys(config.transitionMatrix?.item_1 ?? {})).toEqual(['item_1', 'item_3']);
    expect(config.transitionMatrix?.item_1.item_1).toBeCloseTo(0.5);
    expect(config.transitionMatrix?.item_1.item_3).toBeCloseTo(0.5);
  });

  it('keeps a dead-end state as it is when an item is added', () => {
    let config: ListVariableConfig = {};
    render(
      <EditedList
        initial={{ selectionStrategy: 'MARKOV_CHAIN', items: [{ id: 'a', value: 'A' }], transitionMatrix: { a: { a: 0 } } }}
        onConfig={(c) => { config = c; }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

    expect(config.transitionMatrix?.a).toEqual({ a: 0 });
  });

  it('names a new item after its id, so no two items get the same name after a delete', () => {
    let config: ListVariableConfig = {};
    render(
      <EditedList
        initial={{ selectionStrategy: 'SEQUENTIAL', items: [{ id: 'item_1', value: 'Item 1' }, { id: 'item_3', value: 'Item 3' }] }}
        onConfig={(c) => { config = c; }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

    expect(config.items?.map(item => item.value)).toEqual(['Item 1', 'Item 3', 'Item 4']);
  });

  it('shows a state without a row as even, as the Core reads it, and keeps it when editing one cell', () => {
    const handleChange = vi.fn();
    render(
      <ListConfigPanel
        config={{
          selectionStrategy: 'MARKOV_CHAIN',
          items: [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }, { id: 'c', value: 'C' }],
          transitionMatrix: { c: { c: 1 } },
        }}
        onChange={handleChange}
      />
    );

    // Rows A and B are missing (e.g. a matrix edited by hand)
    const cells = screen.getAllByLabelText('Transition probability');
    expect(cells.slice(0, 3).map(c => (c as HTMLInputElement).value)).toEqual(['0.333', '0.333', '0.333']);
    expect(cells.slice(6).map(c => (c as HTMLInputElement).value)).toEqual(['0', '0', '1']);

    fireEvent.change(cells[0], { target: { value: '0.5' } });
    expect(handleChange).toHaveBeenLastCalledWith({
      transitionMatrix: { c: { c: 1 }, a: { a: 0.5, b: 1 / 3, c: 1 / 3 } },
    });
  });

  it('does not offer list inheritance: a list only has its own items', () => {
    render(<ListConfigPanel config={defaultConfig} onChange={vi.fn()} />);

    expect(screen.queryByLabelText(/Inherit value from parent-scope List/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Inherited')).not.toBeInTheDocument();
  });

  it('moves an item by reordering the items and writing the order', () => {
    const handleChange = vi.fn();
    render(<ListConfigPanel config={defaultConfig} onChange={handleChange} />);

    fireEvent.click(screen.getAllByTitle('Move Down')[0]);

    expect(handleChange).toHaveBeenCalledWith({
      itemOrder: ['item2', 'item1'],
      items: [expect.objectContaining({ id: 'item2' }), expect.objectContaining({ id: 'item1' })],
    });
  });

  it('starts every state without a row even when switching to Markov, keeping the rows already edited', () => {
    const handleChange = vi.fn();
    render(
      <ListConfigPanel
        config={{ selectionStrategy: 'SEQUENTIAL', items: [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }], transitionMatrix: { a: { b: 1 } } }}
        onChange={handleChange}
      />
    );

    fireEvent.click(document.getElementById('selection-strategy-select')!);
    fireEvent.click(screen.getByRole('option', { name: /Markov Chain/i }));

    expect(handleChange).toHaveBeenCalledWith({
      selectionStrategy: 'MARKOV_CHAIN',
      transitionMatrix: { a: { b: 1 }, b: { a: 0.5, b: 0.5 } },
    });
  });

  it('does not offer list inheritance inside the generator of a Dynamic Generator item', () => {
    render(
      <ListConfigPanel
        config={{ selectionStrategy: 'SEQUENTIAL', items: [{ id: 'g', value: '', isEmbedded: true, embeddedType: 'string', embeddedConfig: {} }] }}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Configure Item/i }));

    // The String generator is shown, without the inheritance box (a list in the app could be inherited from)
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Random' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Inherit value from parent-scope List/i)).not.toBeInTheDocument();
  });
});
