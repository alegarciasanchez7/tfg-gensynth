import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
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
});

