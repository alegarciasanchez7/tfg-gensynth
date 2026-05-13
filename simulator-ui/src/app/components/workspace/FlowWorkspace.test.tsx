import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowWorkspace } from './FlowWorkspace';
import type { Flow, Group } from '../../types';

// Mock the context and other dependencies
const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock('../../context', () => ({
  useApp: () => mockUseApp(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FlowWorkspace', () => {
  const mockActions = {
    updateFlowConfig: vi.fn(),
    setFormatTemplate: vi.fn(),
    setFlowConnectorSelection: vi.fn(),
    setFlowConnectorConfig: vi.fn(),
    deleteFlow: vi.fn(),
  };

  const mockState = {
    connectorCatalog: [],
    connectorHealthSummary: [],
    flowConnectorSelections: {},
    flowConnectorConfigs: {},
  };

  const group: Group = {
    id: 'g1',
    name: 'Test Group',
    status: 'stopped',
    throughput: '0 msg/s',
    description: '',
    threads: 1,
    outputMode: 'parallel',
    flows: [],
    expanded: false,
    enabled: true,
  };

  const flow: Flow = {
    id: 'f1',
    name: 'Test Flow',
    technology: 'file',
    connectionStatus: 'disconnected',
    throughput: '0 msg/s',
    hasError: false,
    interval: 1000,
    burst: 1,
    topic: 'test',
    host: 'localhost',
    port: 8080,
    template: 'CUSTOM_FLOW_TEMPLATE_FROM_OBJECT',
    latency: 0,
    enabled: true,
  };

  beforeEach(() => {
    cleanup();
    mockUseApp.mockReturnValue({ state: mockState, actions: mockActions });
  });

  it('displays the template from the flow object when template prop is undefined', () => {
    render(
      <FlowWorkspace
        flow={flow}
        group={group}
        template={undefined as any}
        onTemplateChange={vi.fn()}
      />
    );

    // The textarea should contain the template from the flow object
    const textareas = screen.getAllByRole('textbox');
    const templateTextarea = textareas.find(t => t.tagName === 'TEXTAREA') as HTMLTextAreaElement;
    expect(templateTextarea.value).toBe('CUSTOM_FLOW_TEMPLATE_FROM_OBJECT');
  });

  it('displays the template from the prop when provided', () => {
    render(
      <FlowWorkspace
        flow={flow}
        group={group}
        template="TEMPLATE_FROM_PROP"
        onTemplateChange={vi.fn()}
      />
    );

    const textareas = screen.getAllByRole('textbox');
    const templateTextarea = textareas.find(t => t.tagName === 'TEXTAREA') as HTMLTextAreaElement;
    expect(templateTextarea.value).toBe('TEMPLATE_FROM_PROP');
  });

  it('falls back to empty string when both prop and flow.template are missing', () => {
    const flowWithoutTemplate = { ...flow, template: undefined };
    
    render(
      <FlowWorkspace
        flow={flowWithoutTemplate as any}
        group={group}
        template={undefined as any}
        onTemplateChange={vi.fn()}
      />
    );

    const textareas = screen.getAllByRole('textbox');
    // Find the textarea (template editor) by excluding other inputs if possible, 
    // or just find the one that is actually a textarea element
    const templateTextarea = textareas.find(t => t.tagName === 'TEXTAREA') as HTMLTextAreaElement;
    // Should contain empty string
    expect(templateTextarea.value).toBe('');
  });
});
