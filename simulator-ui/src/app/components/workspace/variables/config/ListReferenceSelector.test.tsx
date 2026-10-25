import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { ListReferenceSelector } from './ListReferenceSelector';

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

const mockState: any = {
  variables: [
    {
      id: 'var_list_global_1',
      name: 'Global Vegetables List',
      type: 'list',
      scope: 'global',
      config: {
        items: [
          { id: 'item_1', value: 'Tomate', weight: 1.0 },
          { id: 'item_2', value: 'Zanahoria', weight: 1.0 },
          { id: 'item_3', value: 'Lechuga', weight: 1.0 },
        ],
      },
    },
    {
      id: 'var_list_group_1',
      name: 'Group 1 Vegetables',
      type: 'list',
      scope: 'group',
      groupId: 'group_1',
      config: {
        items: [
          { id: 'item_g1', value: 'Espinaca', weight: 1.0 },
        ],
      },
    },
    {
      id: 'var_list_local_1',
      name: 'Local List Private',
      type: 'list',
      scope: 'local',
      flowId: 'flow_1',
      groupId: 'group_1',
      config: {
        items: [{ id: 'item_loc', value: 'Private', weight: 1.0 }],
      },
    },
  ],
  groups: [
    {
      id: 'group_1',
      name: 'Group 1',
      flows: [{ id: 'flow_1', name: 'Flow 1' }],
    },
  ],
  flows: [{ id: 'flow_1', name: 'Flow 1' }],
};

describe('ListReferenceSelector', () => {
  beforeAll(() => {
    // Radix tooltips measure their trigger; jsdom has no ResizeObserver
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    mockUseApp.mockReturnValue({
      state: mockState,
      actions: {},
    });
  });

  it('renders checkbox to toggle list reference', () => {
    const handleChange = vi.fn();
    render(
      <ListReferenceSelector
        config={{}}
        onChange={handleChange}
        variableScope="local"
        variableType="string"
        flowId="flow_1"
        groupId="group_1"
      />
    );

    const checkbox = screen.getByLabelText(/Inherit value from parent-scope List/i);
    expect(checkbox).toBeDefined();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceListVariableId: 'var_list_global_1',
      })
    );
  });

  it('filters accessible lists according to scope rules (Global and Group matching groupId)', () => {
    const handleChange = vi.fn();
    render(
      <ListReferenceSelector
        config={{ sourceListVariableId: 'var_list_global_1' }}
        onChange={handleChange}
        variableScope="local"
        variableType="string"
        flowId="flow_1"
        groupId="group_1"
      />
    );

    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

    // Global and Group 1 lists should be present, but Local list must NOT be accessible
    expect(options.some((opt) => opt?.includes('Global Vegetables List'))).toBe(true);
    expect(options.some((opt) => opt?.includes('Group 1 Vegetables'))).toBe(true);
    expect(options.some((opt) => opt?.includes('Local List Private'))).toBe(false);
  });

  it('offers a GROUP variable the Global and Group lists of its group, and says so', () => {
    render(
      <ListReferenceSelector
        config={{ sourceListVariableId: 'var_list_global_1' }}
        onChange={vi.fn()}
        variableScope="group"
        variableType="string"
        groupId="group_1"
      />
    );

    expect(screen.getByText('Source List Variable (Global or Group)')).toBeInTheDocument();
    const options = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map((o) => o.textContent);
    expect(options.some((opt) => opt?.includes('Group 1 Vegetables'))).toBe(true);
  });

  it('labels the source lists of a GLOBAL variable as Global only', () => {
    render(
      <ListReferenceSelector
        config={{ sourceListVariableId: 'var_list_global_1' }}
        onChange={vi.fn()}
        variableScope="global"
        variableType="string"
      />
    );

    expect(screen.getByText('Source List Variable (Global)')).toBeInTheDocument();
  });

  it('disables the check box and explains why when there is no list to inherit from', async () => {
    const user = userEvent.setup();
    mockUseApp.mockReturnValue({ state: { variables: [], groups: [], flows: [] }, actions: {} });
    const handleChange = vi.fn();
    render(<ListReferenceSelector config={{}} onChange={handleChange} variableScope="global" variableType="string" />);

    const checkbox = screen.getByLabelText(/Inherit value from parent-scope List/i);
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(handleChange).not.toHaveBeenCalled();

    await user.hover(checkbox.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Create another GLOBAL List variable first');
  });

  it('keeps an enabled check box usable when its list is no longer available, so it can be cleared', () => {
    mockUseApp.mockReturnValue({ state: { variables: [], groups: [], flows: [] }, actions: {} });
    const handleChange = vi.fn();
    render(
      <ListReferenceSelector config={{ sourceListVariableId: 'gone' }} onChange={handleChange} variableScope="local" variableType="string" />
    );

    const checkbox = screen.getByLabelText(/Inherit value from parent-scope List/i);
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ sourceListVariableId: undefined }));
  });

  it('offers Random Item, Specific Fixed and Inherited Generation, without emojis', () => {
    const handleChange = vi.fn();
    render(
      <ListReferenceSelector
        config={{ sourceListVariableId: 'var_list_global_1', sourceListSelectionMode: 'RANDOM_ITEM' }}
        onChange={handleChange}
        variableScope="local"
        variableType="string"
        flowId="flow_1"
        groupId="group_1"
      />
    );

    expect(['Random Item', 'Specific Fixed', 'Inherited Generation'].map(name => screen.getByRole('button', { name }).textContent))
      .toEqual(['Random Item', 'Specific Fixed', 'Inherited Generation']);

    fireEvent.click(screen.getByRole('button', { name: 'Inherited Generation' }));
    expect(handleChange).toHaveBeenCalledWith({ sourceListSelectionMode: 'INHERITED_GENERATION' });
  });

  it('names the strategy of the list that Inherited Generation follows', () => {
    mockUseApp.mockReturnValue({
      state: { ...mockState, variables: [{ ...mockState.variables[0], config: { ...mockState.variables[0].config, selectionStrategy: 'MARKOV_CHAIN' } }] },
      actions: {},
    });
    render(
      <ListReferenceSelector
        config={{ sourceListVariableId: 'var_list_global_1', sourceListSelectionMode: 'INHERITED_GENERATION' }}
        onChange={vi.fn()}
        variableScope="global"
        variableType="numeric"
      />
    );

    expect(screen.getByText(/Items are picked as the list picks them \(Markov Chain\)/)).toBeInTheDocument();
  });

  it('does not offer Inherited Generation for a Fixed Subset list, which returns all its items at once', () => {
    mockUseApp.mockReturnValue({
      state: { ...mockState, variables: [{ ...mockState.variables[0], config: { ...mockState.variables[0].config, selectionStrategy: 'FIXED_SUBSET' } }] },
      actions: {},
    });
    render(
      <ListReferenceSelector
        config={{ sourceListVariableId: 'var_list_global_1' }}
        onChange={vi.fn()}
        variableScope="global"
        variableType="string"
      />
    );

    expect(screen.getByRole('button', { name: 'Inherited Generation' })).toBeDisabled();
  });
});
