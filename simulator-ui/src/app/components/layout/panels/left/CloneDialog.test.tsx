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

  it('calls onConfirm with the entered count', () => {
    render(<CloneDialog {...defaultProps} />);
    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '5' } });
    
    const cloneButton = screen.getByText('Clone');
    fireEvent.click(cloneButton);
    
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(5);
  });

  it('disables the clone button for invalid counts', () => {
    render(<CloneDialog {...defaultProps} />);
    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '0' } });
    
    const cloneButton = screen.getByText('Clone');
    expect(cloneButton).toBeDisabled();
  });
});
