import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoundaryExpandModal, useBoundaryModalContext } from './BoundaryExpandModal';
import { TooltipProvider } from '../../../ui/tooltip';

const FullScreenProbe = () => {
  const { isFullScreen } = useBoundaryModalContext();
  return <span>{isFullScreen ? 'full screen' : 'windowed'}</span>;
};

const renderModal = (onClose: () => void, isOpen = true, children: React.ReactNode = <FullScreenProbe />) =>
  render(
    <TooltipProvider>
      <BoundaryExpandModal isOpen={isOpen} onClose={onClose} title="2D Spatial Boundary Grid">
        {children}
      </BoundaryExpandModal>
    </TooltipProvider>
  );

describe('BoundaryExpandModal', () => {
  it('renders nothing when closed', () => {
    renderModal(vi.fn(), false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is exposed as a modal dialog', () => {
    renderModal(vi.fn());
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape while a confirmation dialog is open', () => {
    const onClose = vi.fn();
    renderModal(onClose, true, <div role="alertdialog">Confirm?</div>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reopens in the standard window after closing from full screen', () => {
    const onClose = vi.fn();
    const { rerender } = renderModal(onClose);
    fireEvent.click(screen.getByLabelText('Expand to Full Screen Window'));
    expect(screen.getByText('full screen')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Done & Apply'));
    expect(onClose).toHaveBeenCalledTimes(1);

    const modal = (isOpen: boolean) => (
      <TooltipProvider>
        <BoundaryExpandModal isOpen={isOpen} onClose={onClose} title="2D Spatial Boundary Grid">
          <FullScreenProbe />
        </BoundaryExpandModal>
      </TooltipProvider>
    );
    rerender(modal(false));
    rerender(modal(true));
    expect(screen.getByText('windowed')).toBeInTheDocument();
  });
});
