import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

function renderHeader(currentFileName: string | null) {
  return render(
    <Header
      systemStatus="stopped"
      onStatusToggle={vi.fn()}
      onNewProject={vi.fn()}
      onLoadProject={vi.fn().mockResolvedValue(undefined)}
      onSaveProject={vi.fn().mockResolvedValue(undefined)}
      onSaveAsProject={vi.fn().mockResolvedValue(undefined)}
      currentFileName={currentFileName}
      isDirty={false}
      isDark
      onThemeToggle={vi.fn()}
      latestConnectors={[]}
      connectorHealthSummary={[]}
      variables={[]}
    />,
  );
}

describe('Header', () => {
  afterEach(() => cleanup());

  it('shows the file name without the project extension and keeps the full name as tooltip', () => {
    const longName = 'a_very_long_project_configuration_file_name.gsynth';
    renderHeader(longName);

    const fileName = screen.getByTestId('project-file-name');
    expect(fileName.textContent).toBe('a_very_long_project_configuration_file_name');
    expect(fileName.getAttribute('title')).toBe(longName);
    expect(fileName.className).toContain('truncate');
  });

  it('shows Untitled when no file is open', () => {
    renderHeader(null);
    expect(screen.getByTestId('project-file-name').textContent).toBe('Untitled');
  });

  it('no longer embeds the telemetry bar', () => {
    renderHeader(null);
    expect(screen.queryByTestId('resource-bar')).toBeNull();
  });
});
