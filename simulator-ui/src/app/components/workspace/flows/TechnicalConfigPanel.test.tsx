import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Flow } from '../../../types';
import type { ConnectorPluginDescriptor } from '../../../core/types';
import { TechnicalConfigPanel } from './TechnicalConfigPanel';

const flow: Flow = {
  id: 'f1',
  name: 'Sensor',
  technology: 'file',
  connectionStatus: 'disconnected',
  throughput: '0 msg/s',
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 3,
  topic: 'readings',
  host: 'localhost',
  port: 0,
  latency: 0,
  enabled: true,
};

const connector: ConnectorPluginDescriptor = {
  pluginId: 'file',
  displayName: 'File Output',
  pluginVersion: '1.0.0',
  coreApiVersion: '1.0.0',
  external: false,
  configSchema: { type: 'object', properties: { outputDir: { type: 'string', title: 'Output directory' } } },
};

function renderPanel(overrides: Partial<Parameters<typeof TechnicalConfigPanel>[0]> = {}) {
  return render(
    <TechnicalConfigPanel
      flow={flow}
      activeTab="technical"
      draftName="Sensor"
      setDraftName={vi.fn()}
      draftEveryTicks="3"
      setDraftEveryTicks={vi.fn()}
      onEveryTicksBlur={vi.fn()}
      connectorSelection={{ pluginId: 'file', pluginVersion: '1.0.0' }}
      latestConnectorForFlow={connector}
      connectorVersions={[connector]}
      availableConnectors={[connector]}
      selectedHealth={null}
      connectorCatalog={[connector]}
      connectorConfig={{ outputDir: './out' }}
      onConnectorChange={vi.fn()}
      onConnectorVersionChange={vi.fn()}
      onConnectorConfigChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe('TechnicalConfigPanel', () => {
  afterEach(() => cleanup());

  it('shows only name, every N ticks, connector + version and connector config, in that order', () => {
    const { container } = renderPanel();
    const name = screen.getByLabelText('Flow name');
    const everyTicks = screen.getByLabelText('Every N ticks');
    const connectorSelect = screen.getByDisplayValue('File Output');
    const configInput = screen.getByDisplayValue('./out');

    const order = [name, everyTicks, connectorSelect, configInput];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(everyTicks).toHaveValue(3);

    for (const removed of [/burst/i, /pattern/i, /jitter/i, /rate limit/i, /error handling/i, /retry/i, /^host$/i, /topic/i]) {
      expect(container).not.toHaveTextContent(removed);
    }
  });

  it('reports changes and blur of the every N ticks input', () => {
    const setDraftEveryTicks = vi.fn();
    const onEveryTicksBlur = vi.fn();
    renderPanel({ setDraftEveryTicks, onEveryTicksBlur });
    const input = screen.getByLabelText('Every N ticks');

    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.blur(input);

    expect(setDraftEveryTicks).toHaveBeenCalledWith('7');
    expect(onEveryTicksBlur).toHaveBeenCalled();
  });
});
