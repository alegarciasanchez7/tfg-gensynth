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

    expect(screen.getByText('Walls & Forbidden Interior Obstacle Zones (2)')).toBeInTheDocument();
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

  it('places a new obstacle at the centre of the region', () => {
    const onChange = vi.fn();
    render(
      <BoundaryObstaclesEditor
        obstacles={[]}
        minPoint={{ x: 0, y: 0, z: 0 }}
        maxPoint={{ x: 100, y: 200, z: 100 }}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('Add Barrier'));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ points: [{ x: 30, y: 100, z: 0 }, { x: 70, y: 100, z: 0 }] }),
    ]);
  });

  describe('vertices of the selected obstacle', () => {
    it('are only shown while an obstacle is selected', () => {
      const { rerender } = render(<BoundaryObstaclesEditor obstacles={sampleObstacles} onChange={vi.fn()} />);
      expect(screen.queryByText(/Vertices of/)).not.toBeInTheDocument();

      rerender(<BoundaryObstaclesEditor obstacles={sampleObstacles} selectedObstacleId="obs_2" onChange={vi.fn()} />);

      expect(screen.getByText('Vertices of Forbidden Pillar Zone')).toBeInTheDocument();
      expect(screen.getAllByLabelText('X')).toHaveLength(4);
      expect(screen.getAllByLabelText('Y')[2]).toHaveValue('20');
    });

    it('applies a typed coordinate when leaving the field, and only to that vertex', () => {
      const onChange = vi.fn();
      render(<BoundaryObstaclesEditor obstacles={sampleObstacles} selectedObstacleId="obs_1" onChange={onChange} />);

      const secondX = screen.getAllByLabelText('X')[1];
      fireEvent.change(secondX, { target: { value: '42' } });
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.blur(secondX);

      expect(onChange).toHaveBeenCalledWith([
        { ...sampleObstacles[0], points: [{ x: 0, y: 0 }, { x: 42, y: 0 }] },
        sampleObstacles[1],
      ]);
    });

    it('applies a coordinate with Enter and ignores text that is not a number', () => {
      const onChange = vi.fn();
      render(<BoundaryObstaclesEditor obstacles={sampleObstacles} selectedObstacleId="obs_1" onChange={onChange} />);
      const firstY = screen.getAllByLabelText('Y')[0];

      fireEvent.change(firstY, { target: { value: 'north' } });
      fireEvent.blur(firstY);
      expect(onChange).not.toHaveBeenCalled();
      expect(firstY).toHaveValue('0');

      fireEvent.change(firstY, { target: { value: '-7.5' } });
      fireEvent.keyDown(firstY, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'obs_1', points: [{ x: 0, y: -7.5 }, { x: 50, y: 0 }] }),
        sampleObstacles[1],
      ]);
    });

    it('uses latitude and longitude on a map and keeps them in range', () => {
      const onChange = vi.fn();
      render(
        <BoundaryObstaclesEditor
          obstacles={sampleObstacles}
          selectedObstacleId="obs_1"
          axisLabels={{ x: 'Latitude', y: 'Longitude' }}
          axisLimits={{ x: 90, y: 180 }}
          onChange={onChange}
        />
      );

      const latitude = screen.getAllByLabelText('Latitude')[0];
      fireEvent.change(latitude, { target: { value: '120' } });
      fireEvent.blur(latitude);

      expect(screen.getAllByLabelText('Longitude')).toHaveLength(2);
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'obs_1', points: [{ x: 90, y: 0 }, { x: 50, y: 0 }] }),
        sampleObstacles[1],
      ]);
    });
  });
});
