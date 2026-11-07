import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    variables: [],
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
    sequentialOrder: 'flow' as const,
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
    everyTicks: 1,
    topic: 'test',
    host: 'localhost',
    port: 8080,
    template: 'CUSTOM_FLOW_TEMPLATE_FROM_OBJECT',
    latency: 0,
    enabled: true,
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
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

  it('sends a committed event loss change through updateFlowConfig', () => {
    render(
      <FlowWorkspace
        flow={flow}
        group={group}
        template="T"
        onTemplateChange={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Outage length (ticks)');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);

    expect(mockActions.updateFlowConfig).toHaveBeenCalledWith('g1', 'f1', { outageDurationTicks: 3 });
  });

  /** The format button that is highlighted as the current one. */
  const currentFormatButton = () =>
    (['JSON', 'XML', 'CSV', 'PLAIN'] as const)
      .map((label) => screen.getByRole('button', { name: label }))
      .filter((button) => button.className.includes('font-bold'));

  it('labels a File Output flow with a JSON template as JSON, even if stored as plain', () => {
    render(
      <FlowWorkspace
        flow={{ ...flow, format: 'plain' }}
        group={group}
        template={'{"id": "{{uuid}}", "t": {{temperature}}}'}
        onTemplateChange={vi.fn()}
      />
    );
    expect(currentFormatButton().map((b) => b.textContent)).toEqual(['JSON']);

    // Converting to CSV starts from JSON, not from PLAIN ("message\n{...}")
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(screen.getByText('Current Template (JSON)')).toBeInTheDocument();
  });

  it('does not open the converter when the active format is clicked', () => {
    render(<FlowWorkspace flow={flow} group={group} template={'{"id": 1}'} onTemplateChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.queryByText('Convert Message Format')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'XML' }));
    expect(screen.getByText('Convert Message Format')).toBeInTheDocument();
  });

  it('keeps a duplicate or empty flow name local with a warning and restores it on blur', () => {
    const groupWithFlows: Group = { ...group, flows: [flow, { ...flow, id: 'f2', name: 'Other Flow' }] };
    render(<FlowWorkspace flow={flow} group={groupWithFlows} template="T" onTemplateChange={vi.fn()} />);
    const input = screen.getByLabelText('Flow name');

    fireEvent.change(input, { target: { value: 'other flow ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('A flow named "other flow" already exists in this group');
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('The flow name cannot be empty');
    expect(mockActions.updateFlowConfig).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(input).toHaveValue('Test Flow');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Test Flow ' } });
    expect(mockActions.updateFlowConfig).not.toHaveBeenCalled();
    expect(input).toHaveValue('Test Flow ');
    fireEvent.change(input, { target: { value: ' Renamed ' } });
    expect(mockActions.updateFlowConfig).toHaveBeenCalledWith('g1', 'f1', { name: 'Renamed' });
  });

  it('shows the Core reason when a flow update is rejected', async () => {
    const { toast } = await import('sonner');
    mockActions.updateFlowConfig.mockReturnValueOnce(
      Promise.reject({ code: 'UNKNOWN_ERROR', message: 'A flow named "X" already exists in this group' }),
    );
    render(<FlowWorkspace flow={flow} group={group} template="T" onTemplateChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Flow name'), { target: { value: 'X' } });

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'A flow named "X" already exists in this group',
      { id: 'flow-config-error-f1' },
    ));
  });
});
