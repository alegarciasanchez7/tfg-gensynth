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

  it('disables the clone button for invalid counts', () => {
    render(<CloneDialog {...defaultProps} />);
    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '0' } });
    
    // Use a function or regex to find the button even when disabled and with dynamic text
    const cloneButton = screen.getByRole('button', { name: /Create.*Clones/i });
    expect(cloneButton).toBeDisabled();
  });
});
