import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CloseConfigurationDialog } from './CloseConfigurationDialog';

describe('CloseConfigurationDialog', () => {
  it('warns that the current file will be closed to create a new one', () => {
    render(
      <CloseConfigurationDialog
        isOpen={true}
        reason="new"
        fileName="demo.json"
        hasUnsavedChanges={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Create New Configuration')).toBeDefined();
    expect(screen.getByText('demo.json')).toBeDefined();
    expect(screen.getByText(/will be closed to create a new one/)).toBeDefined();
    expect(screen.queryByText('Discard Changes')).toBeNull();
  });

  it('confirms without saving when there are no unsaved changes', async () => {
    const handleConfirm = vi.fn();
    render(
      <CloseConfigurationDialog
        isOpen={true}
        reason="new"
        fileName={null}
        hasUnsavedChanges={false}
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Untitled')).toBeDefined();
    fireEvent.click(screen.getByText('Create New'));
    await waitFor(() => expect(handleConfirm).toHaveBeenCalledWith(false));
  });

  it('offers to save or discard when there are unsaved changes', async () => {
    const handleConfirm = vi.fn();
    render(
      <CloseConfigurationDialog
        isOpen={true}
        reason="load"
        fileName="demo.json"
        hasUnsavedChanges={true}
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Open Configuration')).toBeDefined();
    expect(screen.getByText(/It has unsaved changes/)).toBeDefined();

    fireEvent.click(screen.getByText('Save & Continue'));
    await waitFor(() => expect(handleConfirm).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByText('Discard Changes'));
    await waitFor(() => expect(handleConfirm).toHaveBeenCalledWith(false));
  });

  it('triggers onCancel when Cancel is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <CloseConfigurationDialog
        isOpen={true}
        reason="new"
        fileName="demo.json"
        hasUnsavedChanges={true}
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
