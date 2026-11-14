import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoundaryExpandModal, useBoundaryModalContext } from './BoundaryExpandModal';
import { TooltipProvider } from '../../../ui/tooltip';
import { Canvas2DBoundaryEditor } from './Canvas2DBoundaryEditor';

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

  it('always opens in fullscreen, with no maximize/restore toggle', () => {
    renderModal(vi.fn());
    expect(screen.getByText('full screen')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveClass('fixed', 'inset-0');
    expect(screen.getByText('2D Spatial Boundary Grid — Fullscreen Boundary Editor')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Expand to Full Screen Window|Restore Standard Window/)).not.toBeInTheDocument();
  });

  it('is rendered in <body>, outside the panel that opens it', () => {
    const { container } = renderModal(vi.fn());
    expect(container).not.toContainElement(screen.getByRole('dialog'));
    expect(document.body).toContainElement(screen.getByRole('dialog'));
  });

  it('closes with Exit Fullscreen', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole('button', { name: /Exit Fullscreen/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Done', () => {
    const onClose = vi.fn();
    renderModal(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes a confirmation of the 2D editor with the first Escape and itself with the second', () => {
    const onClose = vi.fn();
    const onChange = vi.fn();
    renderModal(
      onClose,
      true,
      <Canvas2DBoundaryEditor minX={0} maxX={100} minY={0} maxY={100} showToolbar onChange={onChange} />
    );
    fireEvent.click(screen.getByText('New Region'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // The key goes to the focused element (the dialog's Cancel button), as in the browser
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
