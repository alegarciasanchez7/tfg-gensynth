import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CloneDialog } from './CloneDialog';
import { afterEach } from 'vitest';

afterEach(cleanup);

describe('CloneDialog', () => {
  const defaultProps = {
    isOpen: true,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Clone Element',
    itemName: 'Test Item',
  };

  it('renders correctly with initial count', () => {
    render(<CloneDialog {...defaultProps} />);
    expect(screen.getByText('Clone Element')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
  });

  it('calls onConfirm with the entered count and default pattern', () => {
    render(<CloneDialog {...defaultProps} />);
    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '5' } });
    
    // The button text changes dynamically: "Create 5 Clones"
    const cloneButton = screen.getByText(/Create 5 Clones/);
    fireEvent.click(cloneButton);
    
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(5, '${name} (Clone ${index})');
  });

  it('previews the final names of clones that collide with existing names', () => {
    render(<CloneDialog {...defaultProps} itemName="Sensor" existingNames={['Sensor', 'sensor (2)']} />);
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Naming Pattern'), { target: { value: '${name}' } });

    expect(screen.getByText('Sensor (3)')).toBeInTheDocument();
    expect(screen.getByText('Sensor (4)')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 names are already used');
    // Renaming is done by the Core: cloning stays allowed
    expect(screen.getByRole('button', { name: /Create 2 Clones/ })).toBeEnabled();
  });

  it('disables the clone button for invalid counts', () => {
    render(<CloneDialog {...defaultProps} />);
    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '0' } });
    
    // Use a function or regex to find the button even when disabled and with dynamic text
    const cloneButton = screen.getByRole('button', { name: /Create.*Clones/i });
    expect(cloneButton).toBeDisabled();
  });
});
