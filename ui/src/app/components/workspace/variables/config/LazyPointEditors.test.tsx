import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LazyPointConfigPanel, LazySpatialBoundariesTab } from './LazyPointEditors';
import { PointVariableConfig } from '../../../../types';

// The first load transforms the editor chunk on demand, which can exceed the default 1 s wait
// while the whole suite runs in parallel
const CHUNK_LOAD = { timeout: 10_000 };

describe('LazyPointEditors', () => {
  const config: PointVariableConfig = {
    coordinateSystem: 'CARTESIAN_3D',
    pattern: 'RANDOM_WALK',
    maxStepDistance: 10.5,
    boundaryBehavior: 'CLAMP',
    minPoint: { x: 0, y: 0, z: 0 },
    maxPoint: { x: 100, y: 100, z: 100 },
  };

  it('loads the point config panel and passes its props through', async () => {
    const handleChange = vi.fn();
    render(<LazyPointConfigPanel config={config} onChange={handleChange} />);

    const stepInput = await screen.findByLabelText(/Max Step Distance/i, {}, CHUNK_LOAD);
    expect(stepInput).toHaveValue('10.5');

    fireEvent.change(stepInput, { target: { value: '5.2' } });
    expect(handleChange).toHaveBeenCalledWith({ maxStepDistance: 5.2 });
  });

  it('loads the spatial boundaries tab and passes its props through', async () => {
    const handleChange = vi.fn();
    render(<LazySpatialBoundariesTab config={config} onChange={handleChange} />);

    fireEvent.click(await screen.findByText(/Bounce \(Rebound\)/i, {}, CHUNK_LOAD));
    expect(handleChange).toHaveBeenCalledWith({ boundaryBehavior: 'BOUNCE' });
  });

  it('shows a loading placeholder until the editor chunk is ready', async () => {
    // A fresh module, so its chunk has not been loaded by the tests above
    vi.resetModules();
    const { LazySpatialBoundariesTab: FreshTab } = await import('./LazyPointEditors');
    render(<FreshTab config={config} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/Loading editor/i)).toBeInTheDocument();
    expect(await screen.findByText(/Clamp \(Stop\)/i, {}, CHUNK_LOAD)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Loading editor/i)).not.toBeInTheDocument();
  });
});
