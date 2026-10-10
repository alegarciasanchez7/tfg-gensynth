import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

import { SettingsDialog, SETTINGS_CATEGORIES } from './SettingsDialog';

describe('SettingsDialog', () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      state: {
        isDark: false,
        autoSaveEnabled: false,
        autoSaveIntervalSeconds: 30,
        connectionMode: 'websocket',
        currentFilePath: null,
        currentFileHandle: null,
        settings: { tick: { mode: 'FIXED_RATE', value: 1, unit: 'SECONDS' } },
        systemStatus: 'stopped',
        metrics: null,
      },
      actions: {
        toggleTheme: vi.fn(),
        setAutoSave: vi.fn(),
        setAutoSaveInterval: vi.fn(),
        updateTickSettings: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => cleanup());

  it('lists every category and opens on Appearance', () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: 'Settings categories' });
    for (const category of SETTINGS_CATEGORIES) {
      expect(nav).toHaveTextContent(category.label);
    }
    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument();
    expect(screen.getByText('Stored on this device')).toBeInTheDocument();
  });

  it('switches between categories', () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save & Storage' }));
    expect(screen.getByRole('switch', { name: 'Auto-save' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Dark mode' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Simulation' }));
    expect(screen.getByLabelText('Tick period value')).toBeInTheDocument();
    expect(screen.getByText('Saved with the project')).toBeInTheDocument();
  });

  it('can open directly on a given category', () => {
    render(<SettingsDialog open onOpenChange={vi.fn()} initialCategory="simulation" />);
    expect(screen.getByRole('button', { name: 'Simulation' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes through the dialog close button', () => {
    const onOpenChange = vi.fn();
    render(<SettingsDialog open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing while closed', () => {
    render(<SettingsDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('navigation', { name: 'Settings categories' })).not.toBeInTheDocument();
  });
});
