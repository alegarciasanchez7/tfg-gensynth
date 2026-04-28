import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
        logs: [
          {
            id: 'l1',
            timestamp: '14:32:01',
            level: 'info',
            source: 'CONNECTORS',
            message: 'RabbitMQ Connector@1.1.0:healthy',
          },
        ],
        connectorHealthSummary,
      },
    })
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
})
