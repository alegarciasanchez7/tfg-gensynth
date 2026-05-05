import { cleanup, render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorHealthSummary } from '../../../../types'

const mockUseApp = vi.fn()

vi.mock('../../../../context', () => ({
  useApp: () => mockUseApp(),
}))

import { BottomPanel } from './BottomPanel'

describe('BottomPanel', () => {
  const connectorHealthSummary: ConnectorHealthSummary[] = [
    {
      pluginId: 'rabbitmq',
      pluginVersion: '1.1.0',
      displayName: 'RabbitMQ Connector',
      status: 'healthy',
      flowCount: 2,
      connectedCount: 2,
      warningCount: 0,
      errorCount: 0,
    },
  ]

  beforeEach(() => {
    mockUseApp.mockReturnValue({
      state: {
        groups: [
          {
            id: 'g-file',
            name: 'File Group',
            status: 'stopped',
            throughput: '0',
            description: '',
            threads: 1,
            outputMode: 'parallel',
            expanded: true,
            flows: [
              {
                id: 'f-file',
                name: 'File Flow',
                technology: 'file',
                connectionStatus: 'disconnected',
                throughput: '0',
                hasError: false,
                interval: 1000,
                burst: 1,
                topic: 'x',
                host: 'localhost',
                port: 0,
              },
            ],
          },
        ],
        logs: [
          {
            id: 'l1',
            timestamp: '14:32:01',
            level: 'info',
            source: 'CONNECTORS',
            message: 'RabbitMQ Connector@1.1.0:healthy',
          },
          {
            id: 'l2',
            timestamp: '14:32:02',
            level: 'debug',
            source: 'f-file',
            message: 'File output -> {"value":1}',
          },
        ],
        connectorHealthSummary,
      },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders connector health in the logs tab', () => {
    render(
      <BottomPanel
        tab="logs"
        onTabChange={vi.fn()}
        systemStatus="running"
      />,
    )

    expect(screen.getByText('Connector Health')).toBeInTheDocument()
    expect(screen.getByText('RabbitMQ Connector')).toBeInTheDocument()
    expect(screen.getByText('healthy')).toBeInTheDocument()
    expect(screen.getByText('RabbitMQ Connector@1.1.0:healthy')).toBeInTheDocument()
  })

  it('filters only file logs when toggled', () => {
    render(
      <BottomPanel
        tab="logs"
        onTabChange={vi.fn()}
        systemStatus="running"
      />,
    )

    expect(screen.getAllByText('RabbitMQ Connector@1.1.0:healthy').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('only file')[0])
    expect(screen.queryAllByText('RabbitMQ Connector@1.1.0:healthy')).toHaveLength(0)
    expect(screen.getByText('File output -> {"value":1}')).toBeInTheDocument()
  })
})
