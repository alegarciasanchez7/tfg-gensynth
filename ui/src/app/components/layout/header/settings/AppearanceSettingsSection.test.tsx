import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockUseApp } = vi.hoisted(() => ({ mockUseApp: vi.fn() }));

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}));

import { AppearanceSettingsSection } from './AppearanceSettingsSection';

describe('AppearanceSettingsSection', () => {
  afterEach(() => cleanup());

  it('reflects the current theme and toggles it', () => {
    const toggleTheme = vi.fn();
    mockUseApp.mockReturnValue({ state: { isDark: true }, actions: { toggleTheme } });
    render(<AppearanceSettingsSection />);

    const toggle = screen.getByRole('switch', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Currently using the dark theme')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });

  it('shows the light theme as unchecked', () => {
    mockUseApp.mockReturnValue({ state: { isDark: false }, actions: { toggleTheme: vi.fn() } });
    render(<AppearanceSettingsSection />);

    expect(screen.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('aria-checked', 'false');
  });
});
