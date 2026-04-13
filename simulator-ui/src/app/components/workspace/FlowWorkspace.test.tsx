import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Flow, Group } from '../../types'
import type { ConnectorHealthSummary } from '../../types'
import type { ConnectorPluginDescriptor } from '../../core/types'

const mockUseApp = vi.fn()

vi.mock('../../context', () => ({
  useApp: () => mockUseApp(),
}))

import { FlowWorkspace } from './FlowWorkspace'

describe('FlowWorkspace', () => {
  beforeEach(() => {
    cleanup()
    mockUseApp.mockReset()
  })

  const flow: Flow = {
    id: 'f1',
    name: 'RabbitMQ · orders',
    technology: 'RabbitMQ',
    connectionStatus: 'connected',
    throughput: '120 msg/s',
    hasError: false,
    interval: 100,
    burst: 1,
    topic: 'orders.events',
    host: 'localhost',
    port: 5672,
  }

  const group: Group = {
    id: 'g1',
    name: 'Orders',
    status: 'running',
    throughput: '120 msg/s',
    description: 'Order stream',
    threads: 2,
    outputMode: 'parallel',
    expanded: true,
    flows: [flow],
  }

  const rabbitV1: ConnectorPluginDescriptor = {
    pluginId: 'rabbitmq',
    displayName: 'RabbitMQ Connector',
    pluginVersion: '1.0.0',
    coreApiVersion: '1.0.0',
    configSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        exchange: { type: 'string' },
      },
    },
  }

  const rabbitV11: ConnectorPluginDescriptor = {
    ...rabbitV1,
    pluginVersion: '1.1.0',
    configSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        exchange: { type: 'string' },
        reconnectAttempts: { type: 'number' },
      },
    },
  }

  const connectorHealthSummary: ConnectorHealthSummary[] = [
    {
      pluginId: 'rabbitmq',
      pluginVersion: '1.1.0',
      displayName: 'RabbitMQ Connector',
      status: 'healthy',
      flowCount: 1,
      connectedCount: 1,
      warningCount: 0,
      errorCount: 0,
    },
  ]

  it('shows connector version selector and dynamic schema fields', () => {
    mockUseApp.mockReturnValue({
      state: {
        flowConnectorSelections: {
          f1: { pluginId: 'rabbitmq', pluginVersion: '1.1.0' },
        },
        flowConnectorConfigs: {
          f1: {
            host: 'broker.local',
            port: 5672,
            exchange: 'events',
            reconnectAttempts: 3,
          },
        },
        connectorCatalog: [rabbitV1, rabbitV11],
        connectorHealthSummary,
      },
      actions: {
        setFlowConnectorSelection: vi.fn(),
        setFlowConnectorConfig: vi.fn(),
      },
    })

    render(
      <FlowWorkspace
        flow={flow}
        group={group}
        template=""
        onTemplateChange={vi.fn()}
      />,
    )

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects).toHaveLength(5)
    expect(selects[0]).toHaveValue('rabbitmq')
    expect(selects[1]).toHaveValue('1.1.0')
    expect(Array.from(selects[1].options).map((option) => option.value)).toEqual(['1.1.0', '1.0.0'])
    expect(screen.getByText('CONNECTOR')).toBeInTheDocument()
    expect(screen.getByText('RabbitMQ Connector', { selector: 'span' })).toBeInTheDocument()
  })

  it('renders a fallback when the catalog is empty', () => {
    mockUseApp.mockReturnValue({
      state: {
        flowConnectorSelections: {},
        flowConnectorConfigs: {},
        connectorCatalog: [],
        connectorHealthSummary: [],
      },
      actions: {
        setFlowConnectorSelection: vi.fn(),
        setFlowConnectorConfig: vi.fn(),
      },
    })

    render(
      <FlowWorkspace
        flow={flow}
        group={group}
        template=""
        onTemplateChange={vi.fn()}
      />,
    )

    expect(screen.getByText('No connectors available yet.', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('The flow will keep its legacy connection data visible until the catalog is loaded.')).toBeInTheDocument()
    expect(screen.getByText('localhost', { selector: 'div' })).toBeInTheDocument()
    expect(screen.getByText('5672', { selector: 'div' })).toBeInTheDocument()
  })
})