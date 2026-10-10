import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../../../core/appInfo';

// The real dialog needs the app context; a stub is enough to check how the header opens it
vi.mock('./settings/SettingsDialog', () => ({
  SettingsDialog: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
    <div data-testid="settings-dialog">
      <button onClick={() => onOpenChange(false)}>close settings</button>
    </div>
  ),
}));

vi.mock('./ConnectorCatalogDialog', () => ({
  ConnectorCatalogDialog: ({ onImportPlugin }: { onImportPlugin: () => void }) => (
    <div data-testid="catalog-dialog">
      <button onClick={onImportPlugin}>import from catalog</button>
    </div>
  ),
}));
vi.mock('./PluginImportPanel', () => ({
  PluginImportPanel: () => <div data-testid="plugin-import-panel" />,
}));

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

  it('opens the settings dialog from the settings button and closes it', () => {
    renderHeader(null);
    expect(screen.queryByTestId('settings-dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close settings'));
    expect(screen.queryByTestId('settings-dialog')).toBeNull();
  });

  it('opens the connector catalog dialog, which can switch to the plugin import', () => {
    renderHeader(null);
    fireEvent.click(screen.getByRole('button', { name: /Connectors/ }));
    expect(screen.getByTestId('catalog-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('import from catalog'));
    expect(screen.queryByTestId('catalog-dialog')).toBeNull();
    expect(screen.getByTestId('plugin-import-panel')).toBeInTheDocument();
  });

  it('shows the application version', () => {
    renderHeader(null);
    expect(screen.getByText(`GenSynth ${APP_VERSION}`)).toBeInTheDocument();
  });
});
