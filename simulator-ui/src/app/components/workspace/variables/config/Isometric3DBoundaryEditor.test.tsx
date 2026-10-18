import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Isometric3DBoundaryEditor, type Isometric3DBoundaryEditorProps } from './Isometric3DBoundaryEditor';

type EmittedBounds = Parameters<Isometric3DBoundaryEditorProps['onChange']>[0];

/** Feeds every emitted change back as props, like the variable editor does. */
const ControlledEditor = ({ onEmit }: { onEmit: (b: EmittedBounds) => void }) => {
  const [props, setProps] = useState({
    minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100,
    shape3DType: 'cube' as const, shape3DWidth: 100, shape3DLength: 100, shape3DHeight: 100,
  });
  return (
    <Isometric3DBoundaryEditor
      {...props}
      shape3DType={props.shape3DType}
      onChange={(b) => {
        onEmit(b);
        setProps((prev) => ({ ...prev, ...b, shape3DType: prev.shape3DType }));
      }}
    />
  );
};

describe('Isometric3DBoundaryEditor', () => {
  const defaultProps = {
    minX: -50,
    maxX: 50,
    minY: -50,
    maxY: 50,
    minZ: 0,
    maxZ: 100,
    polygon: [
      { x: -50, y: -50, z: 0 },
      { x: 50, y: -50, z: 0 },
      { x: 50, y: 50, z: 0 },
      { x: -50, y: 50, z: 0 },
    ],
    shape3DType: 'cube' as const,
    shape3DWidth: 100,
    shape3DLength: 100,
    shape3DHeight: 100,
    shape3DRadius: 50,
    onChange: vi.fn(),
  };

  it('renders correctly with English shape buttons, Orbit View toggle, and side panel', () => {
    render(<Isometric3DBoundaryEditor {...defaultProps} />);

    expect(screen.getByText('Cube')).toBeInTheDocument();
    expect(screen.getByText('Pyramid')).toBeInTheDocument();
    expect(screen.getByText('Cone')).toBeInTheDocument();
    expect(screen.getByText('Sphere')).toBeInTheDocument();
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();

    expect(screen.getByText('Orbit View')).toBeInTheDocument();
    expect(screen.getByText('3D Parametric Limits')).toBeInTheDocument();
    expect(screen.getByText('Base Width (X)')).toBeInTheDocument();
    expect(screen.getByText('Base Length (Y)')).toBeInTheDocument();
    expect(screen.getByText('Height (Z)')).toBeInTheDocument();
  });

  it('switches 3D shape preset when clicked', () => {
    const onChange = vi.fn();
    render(<Isometric3DBoundaryEditor {...defaultProps} onChange={onChange} />);

    const sphereBtn = screen.getByText('Sphere');
    fireEvent.click(sphereBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        shape3DType: 'sphere',
      })
    );
  });

  it('displays radius input when sphere shape is active', () => {
    render(<Isometric3DBoundaryEditor {...defaultProps} shape3DType="sphere" />);

    expect(screen.getByText('Radius (R)')).toBeInTheDocument();
    expect(screen.queryByText('Base Width (X)')).not.toBeInTheDocument();
  });

  it('updates height when input changes', () => {
    const onChange = vi.fn();
    render(<Isometric3DBoundaryEditor {...defaultProps} onChange={onChange} />);

    const heightInput = screen.getByLabelText('Height (Z)');
    fireEvent.change(heightInput, { target: { value: '150' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(heightInput);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        shape3DHeight: 150,
      })
    );
  });

  it('keeps the base elevation when a negative height is committed', () => {
    const onEmit = vi.fn();
    render(<ControlledEditor onEmit={onEmit} />);

    const heightInput = screen.getByLabelText('Height (Z)');
    fireEvent.change(heightInput, { target: { value: '-50' } });
    fireEvent.keyDown(heightInput, { key: 'Enter' });

    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenLastCalledWith(expect.objectContaining({ minZ: -50, maxZ: 0, shape3DHeight: -50 }));
    expect(screen.getByLabelText('Base Elevation (minZ)')).toHaveValue(0);
    expect(heightInput).toHaveValue(-50);
  });

  it('reverts an input that is cleared instead of forcing a value', () => {
    const onChange = vi.fn();
    render(<Isometric3DBoundaryEditor {...defaultProps} onChange={onChange} />);

    const widthInput = screen.getByLabelText('Base Width (X)');
    fireEvent.change(widthInput, { target: { value: '' } });
    fireEvent.blur(widthInput);

    expect(onChange).not.toHaveBeenCalled();
    expect(widthInput).toHaveValue(100);
  });

  it('centres the footprint on the X/Y bounds and gives a sphere its full diameter', () => {
    const onChange = vi.fn();
    render(
      <Isometric3DBoundaryEditor {...defaultProps} minX={0} maxX={100} minY={0} maxY={100} onChange={onChange} />
    );

    fireEvent.click(screen.getByText('Sphere'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100, shape3DRadius: 50 })
    );
  });

  it('commits a height handle drag once, on pointer-up', () => {
    const onChange = vi.fn();
    const { container } = render(<Isometric3DBoundaryEditor {...defaultProps} onChange={onChange} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;

    // Find the height handle by hovering over the canvas until the cursor changes to grab
    let handle: { x: number; y: number } | null = null;
    for (let y = 0; y < 220 && !handle; y += 2) {
      fireEvent.pointerMove(canvas, { clientX: 180, clientY: y });
      if (canvas.className.includes('cursor-grab')) handle = { x: 180, y };
    }
    expect(handle).not.toBeNull();
    const start = handle as { x: number; y: number };

    fireEvent.pointerDown(canvas, { clientX: start.x, clientY: start.y, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: start.x, clientY: start.y - 10, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: start.x, clientY: start.y - 20, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(canvas, { clientX: start.x, clientY: start.y - 20, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as EmittedBounds;
    expect(emitted.shape3DHeight).toBeGreaterThan(100);
  });

  it('grows the footprint when the corner handle is dragged away from the shape', () => {
    const onChange = vi.fn();
    const { container } = render(<Isometric3DBoundaryEditor {...defaultProps} onChange={onChange} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;

    // The corner handle is the grab spot lowest on the canvas (the height handle is on top)
    let corner: { x: number; y: number } | null = null;
    for (let y = 0; y < canvas.height; y += 3) {
      for (let x = 0; x < canvas.width; x += 3) {
        fireEvent.pointerMove(canvas, { clientX: x, clientY: y });
        if (canvas.className.includes('cursor-grab')) corner = { x, y };
      }
    }
    expect(corner).not.toBeNull();
    const start = corner as { x: number; y: number };

    // Move 30 px further from the canvas centre, along the centre → handle direction
    const vx = start.x - canvas.width / 2;
    const vy = start.y - canvas.height / 2;
    const len = Math.hypot(vx, vy);
    const end = { x: start.x + (vx / len) * 30, y: start.y + (vy / len) * 30 };

    fireEvent.pointerDown(canvas, { clientX: start.x, clientY: start.y, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: end.x, clientY: end.y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: end.x, clientY: end.y, pointerId: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as EmittedBounds;
    expect(emitted.shape3DWidth).toBeGreaterThan(100);
    expect(emitted.shape3DLength).toBeGreaterThan(100);
  });
});
