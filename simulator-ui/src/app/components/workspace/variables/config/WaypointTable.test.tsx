import type React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WaypointTable } from './WaypointTable';
import type { FullPoint } from '../../../../core/pointDefaults';

const waypoints: FullPoint[] = [
  { x: 10, y: 20, z: 5 },
  { x: 30, y: 40, z: 6 },
];

const renderTable = (overrides: Partial<React.ComponentProps<typeof WaypointTable>> = {}) => {
  const props = {
    waypoints,
    showZ: true,
    isGeo: false,
    onEditCoord: vi.fn(() => true),
    onMoveRow: vi.fn(),
    onDelete: vi.fn(),
    onAdd: vi.fn(),
    ...overrides,
  };
  render(<WaypointTable {...props} />);
  return props;
};

describe('WaypointTable', () => {
  it('shows one row per waypoint with X / Y / Z columns', () => {
    renderTable();

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['#', 'X', 'Y', 'Z', '']);
    expect(screen.getByLabelText('Waypoint 2 Z')).toHaveValue('6');
  });

  it('uses Lat / Lon / Alt headers in Geospatial and hides Z in 2D', () => {
    renderTable({ isGeo: true });
    expect(screen.getByText('Lat')).toBeInTheDocument();
    expect(screen.getByText('Alt')).toBeInTheDocument();
    expect(screen.getByLabelText('Waypoint 1 latitude')).toHaveValue('10');
  });

  it('hides the Z column in 2D', () => {
    renderTable({ showZ: false });
    expect(screen.queryByText('Z')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Waypoint 1 Z')).not.toBeInTheDocument();
  });

  it('commits a typed coordinate once, on blur or Enter, never per keystroke', () => {
    const props = renderTable();
    const input = screen.getByLabelText('Waypoint 1 X');

    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(props.onEditCoord).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(props.onEditCoord).toHaveBeenCalledTimes(1);
    expect(props.onEditCoord).toHaveBeenCalledWith(0, 'x', '12');
  });

  it('restores the value when the commit is rejected', () => {
    renderTable({ onEditCoord: vi.fn(() => false) });
    const input = screen.getByLabelText('Waypoint 1 Y');

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);

    expect(input).toHaveValue('20');
  });

  it('reorders, deletes and adds through its buttons', () => {
    const props = renderTable();

    expect(screen.getByRole('button', { name: 'Move waypoint 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move waypoint 2 down' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move waypoint 1 down' }));
    expect(props.onMoveRow).toHaveBeenCalledWith(0, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Move waypoint 2 up' }));
    expect(props.onMoveRow).toHaveBeenLastCalledWith(1, -1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete waypoint 2' }));
    expect(props.onDelete).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: /Add waypoint/ }));
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows only the Add waypoint button when there are no waypoints', () => {
    renderTable({ waypoints: [] });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add waypoint/ })).toBeInTheDocument();
  });
});
