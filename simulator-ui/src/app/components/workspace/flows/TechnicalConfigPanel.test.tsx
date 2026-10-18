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
  description: 'Writes to a file',
  apiVersion: '1.0',
  external: false,
  fields: [
    { key: 'outputDir', type: 'TEXT', label: 'Output directory', tooltip: '', required: true, defaultValue: null, placeholder: '', options: [] },
  ],
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
      onEventLossChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe('TechnicalConfigPanel', () => {
  afterEach(() => cleanup());

  it('shows only name, every N ticks, connector + version, connector config and event loss, in that order', () => {
    const { container } = renderPanel();
    const name = screen.getByLabelText('Flow name');
    const everyTicks = screen.getByLabelText('Every N ticks');
    const connectorSelect = screen.getByDisplayValue('File Output');
    const configInput = screen.getByDisplayValue('./out');
    const lossPercent = screen.getByLabelText('Random loss (%)');
    const outageEvery = screen.getByLabelText('Outage every N ticks');
    const outageLength = screen.getByLabelText('Outage length (ticks)');

    const order = [name, everyTicks, connectorSelect, configInput, lossPercent, outageEvery, outageLength];
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

  it('shows the event loss of the flow (missing = 0) and reports committed changes', () => {
    const onEventLossChange = vi.fn();
    renderPanel({ flow: { ...flow, outageEveryTicks: 6 }, onEventLossChange });

    expect(screen.getByLabelText('Random loss (%)')).toHaveValue('0');
    expect(screen.getByLabelText('Outage every N ticks')).toHaveValue('6');

    const input = screen.getByLabelText('Random loss (%)');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);

    expect(onEventLossChange).toHaveBeenCalledWith({ lossPercent: 10 });
  });
});
