import { describe, it, expect } from 'vitest';
import { normalizeConnectorState } from './connectorHelpers';
import type { ConnectorPluginDescriptor } from '../../core/types';
import type { Flow, Group } from '../../types';

const rabbit: ConnectorPluginDescriptor = {
  pluginId: 'rabbitmq',
  displayName: 'RabbitMQ',
  pluginVersion: '1.0.0',
  description: '',
  apiVersion: '1.0',
  external: true,
  fields: [
    { key: 'host', type: 'TEXT', label: 'Host', tooltip: '', required: true, defaultValue: 'localhost', placeholder: '', options: [] },
    { key: 'port', type: 'INTEGER', label: 'Port', tooltip: '', required: false, defaultValue: 5672, placeholder: '', options: [] },
  ],
};

const flow = (connectorConfig?: Record<string, unknown>): Flow => ({
  id: 'f1',
  name: 'Flow',
  technology: 'rabbitmq',
  connectionStatus: 'disconnected',
  throughput: '0 msg/s',
  hasError: false,
  interval: 1000,
  burst: 1,
  everyTicks: 1,
  topic: '',
  host: '',
  port: 0,
  latency: 0,
  enabled: true,
  connectorConfig,
});

const group = (flows: Flow[]): Group => ({
  id: 'g1',
  name: 'Group',
  status: 'stopped',
  throughput: '0 msg/s',
  description: '',
  threads: 1,
  outputMode: 'parallel',
  expanded: true,
  enabled: true,
  flows,
});

describe('normalizeConnectorState', () => {
  it('seeds the editor with the saved connector configuration, completed with defaults', () => {
    const { selections, configs } = normalizeConnectorState([group([flow({ host: 'broker' })])], [rabbit]);

    expect(selections.f1).toEqual({ pluginId: 'rabbitmq', pluginVersion: '1.0.0' });
    expect(configs.f1).toEqual({ host: 'broker', port: 5672 });
  });

  it('uses the defaults for a flow without saved configuration', () => {
    const { configs } = normalizeConnectorState([group([flow()])], [rabbit]);
    expect(configs.f1).toEqual({ host: 'localhost', port: 5672 });
  });

  it('keeps the configuration already being edited', () => {
    const { configs } = normalizeConnectorState([group([flow({ host: 'saved' })])], [rabbit], {}, { f1: { host: 'editing' } });
    expect(configs.f1).toEqual({ host: 'editing' });
  });
});
