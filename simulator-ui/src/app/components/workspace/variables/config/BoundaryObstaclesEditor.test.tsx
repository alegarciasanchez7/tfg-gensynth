import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoundaryObstaclesEditor } from './BoundaryObstaclesEditor';
import { BoundaryObstacle } from '../../../../types';

describe('BoundaryObstaclesEditor', () => {
  const sampleObstacles: BoundaryObstacle[] = [
    {
      id: 'obs_1',
      name: 'North House Wall',
      type: 'WALL_SEGMENT',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
      enabled: true,
    },
    {
      id: 'obs_2',
      name: 'Forbidden Pillar Zone',
      type: 'OBSTACLE_POLYGON',
      points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
      enabled: true,
    },
  ];

  it('renders configured obstacle barriers correctly in English', () => {
    render(<BoundaryObstaclesEditor obstacles={sampleObstacles} onChange={vi.fn()} />);

    expect(screen.getByText('2D Walls & Forbidden Interior Obstacle Zones (2)')).toBeInTheDocument();
    expect(screen.getByText('North House Wall')).toBeInTheDocument();
    expect(screen.getByText('Forbidden Pillar Zone')).toBeInTheDocument();
  });

  it('adds a new wall barrier when form is submitted', () => {
    const onChange = vi.fn();
    render(<BoundaryObstaclesEditor obstacles={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText('e.g. Living Room Wall');
    fireEvent.change(input, { target: { value: 'East Room Barrier' } });

    const addButton = screen.getByText('Add Barrier');
    fireEvent.click(addButton);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'East Room Barrier',
        type: 'WALL_SEGMENT',
        enabled: true,
      }),
    ]);
  });

  it('toggles obstacle enabled state', () => {
    const onChange = vi.fn();
    render(<BoundaryObstaclesEditor obstacles={sampleObstacles} onChange={onChange} />);

    const disableButtons = screen.getAllByTitle('Disable Barrier');
    fireEvent.click(disableButtons[0]);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'obs_1', enabled: false }),
      sampleObstacles[1],
    ]);
  });
});

