import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorPluginDescriptor } from '../../../core/types';
import type { ConnectorHealthSummary } from '../../../types';

const { uninstallPlugin } = vi.hoisted(() => ({ uninstallPlugin: vi.fn() }));

vi.mock('../../../core/bridge', () => ({
  CoreCommands: { uninstallPlugin },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConnectorCatalogDialog } from './ConnectorCatalogDialog';

const fileConnector: ConnectorPluginDescriptor = {
  pluginId: 'file',
  displayName: 'File Output',
  pluginVersion: '1.0.0',
  description: 'Writes the messages of the flow to a local file.',
  apiVersion: '1.0',
  external: false,
  fields: [
    {
      key: 'format',
      type: 'SELECT',
      label: 'File format',
      tooltip: 'How messages are written.',
      required: false,
      defaultValue: 'json',
      placeholder: '',
      options: [
        { value: 'json', label: 'JSON array' },
        { value: 'txt', label: 'Text' },
      ],
    },
  ],
};

const brokerConnector: ConnectorPluginDescriptor = {
  pluginId: 'broker',
  displayName: 'Broker',
  pluginVersion: '1.0.0',
  description: 'Sends messages to a broker.',
  apiVersion: '1.0',
  external: true,
  fields: [
    { key: 'host', type: 'TEXT', label: 'Host', tooltip: 'Broker host name.', required: true, defaultValue: 'localhost', placeholder: '', options: [] },
    { key: 'port', type: 'INTEGER', label: 'Port', tooltip: '', required: false, defaultValue: 5672, placeholder: '', min: 1, max: 65535, options: [] },
    { key: 'password', type: 'PASSWORD', label: 'Password', tooltip: '', required: true, defaultValue: 'secret', placeholder: '', options: [] },
  ],
};

const brokerHealth: ConnectorHealthSummary = {
  pluginId: 'broker',
  pluginVersion: '1.0.0',
  displayName: 'Broker',
  status: 'degraded',
  flowCount: 3,
  connectedCount: 2,
  warningCount: 1,
  errorCount: 0,
};

function renderDialog(overrides: Partial<Parameters<typeof ConnectorCatalogDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    latestConnectors: [fileConnector, brokerConnector],
    connectorHealthSummary: [brokerHealth],
    onImportPlugin: vi.fn(),
    ...overrides,
  };
  render(<ConnectorCatalogDialog {...props} />);
  return props;
}

describe('ConnectorCatalogDialog', () => {
  afterEach(() => {
    cleanup();
    uninstallPlugin.mockReset();
  });

  it('lists every connector and shows the first one by default', () => {
    renderDialog();

    const nav = screen.getByRole('navigation', { name: 'Connectors' });
    expect(within(nav).getByText('File Output')).toBeTruthy();
    expect(within(nav).getByText('Broker')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'File Output' })).toBeTruthy();
    expect(screen.getByText('Writes the messages of the flow to a local file.')).toBeTruthy();
    expect(screen.getByText('No running flow uses this connector.')).toBeTruthy();
  });

  it('shows the fields of the selected connector with their help, defaults, ranges and options', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Broker/ }));

    expect(screen.getByRole('heading', { name: 'Broker' })).toBeTruthy();
    expect(screen.getByText('Configuration fields (3)')).toBeTruthy();

    const host = screen.getByTestId('catalog-field-host');
    expect(within(host).getByText('Required')).toBeTruthy();
    expect(within(host).getByText('Broker host name.')).toBeTruthy();
    expect(within(host).getByText('localhost')).toBeTruthy();

    const port = screen.getByTestId('catalog-field-port');
    expect(within(port).getByText('Optional')).toBeTruthy();
    expect(within(port).getByText('1 – 65535')).toBeTruthy();

    // Secret defaults are never displayed
    expect(within(screen.getByTestId('catalog-field-password')).queryByText('secret')).toBeNull();
  });

  it('shows the option labels of a select field', () => {
    renderDialog();
    const format = screen.getByTestId('catalog-field-format');
    expect(within(format).getByText('JSON array, Text')).toBeTruthy();
    expect(within(format).getByText('JSON array')).toBeTruthy();
  });

  it('shows the usage of a connector used by running flows', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Broker/ }));

    const usage = screen.getByRole('region', { name: 'Usage' });
    expect(within(usage).getByText('Flows').previousSibling?.textContent).toBe('3');
    expect(within(usage).getByText('Connected').previousSibling?.textContent).toBe('2');
    expect(screen.getByText('degraded')).toBeTruthy();
  });

  it('offers uninstall only for plugins and asks for confirmation first', async () => {
    uninstallPlugin.mockResolvedValue({ success: true, message: 'ok' });
    renderDialog();

    expect(screen.queryByRole('button', { name: /Uninstall plugin/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Broker/ }));
    fireEvent.click(screen.getByRole('button', { name: /Uninstall plugin/ }));
    expect(uninstallPlugin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Uninstall$/ }));
    await waitFor(() => expect(uninstallPlugin).toHaveBeenCalledWith('broker', '1.0.0'));
  });

  it('opens the plugin import from the catalog', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Import plugin/ }));
    expect(props.onImportPlugin).toHaveBeenCalled();
  });

  it('shows an empty state when no connector is loaded', () => {
    renderDialog({ latestConnectors: [], connectorHealthSummary: [] });
    expect(screen.getByText('No connectors loaded')).toBeTruthy();
  });
});
