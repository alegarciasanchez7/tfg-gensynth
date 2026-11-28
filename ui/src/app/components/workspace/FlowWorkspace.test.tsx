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

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: mockToast,
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
        template={undefined as unknown as string}
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
        flow={flowWithoutTemplate}
        group={group}
        template={undefined as unknown as string}
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
    expect(mockActions.updateFlowConfig).toHaveBeenCalledWith('g1', 'f1', {
      template: 'id,t\n{{uuid}},{{temperature}}',
      format: 'csv',
    });
  });

  it('converts at once when another format is clicked, with an Undo', () => {
    const onTemplateChange = vi.fn();
    render(<FlowWorkspace flow={{ ...flow, format: 'json' }} group={group} template={'{"id": 1}'} onTemplateChange={onTemplateChange} />);

    // The active format does nothing
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(mockActions.updateFlowConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'XML' }));
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <id>1</id>\n</root>';
    expect(onTemplateChange).toHaveBeenCalledWith(xml);
    expect(mockActions.updateFlowConfig).toHaveBeenCalledWith('g1', 'f1', { template: xml, format: 'xml' });
    expect(mockToast.success).toHaveBeenCalledWith('Converted to XML', expect.objectContaining({
      action: expect.objectContaining({ label: 'Undo' }),
    }));

    const undo = mockToast.success.mock.calls[0][1].action.onClick as () => void;
    undo();
    expect(mockActions.updateFlowConfig).toHaveBeenLastCalledWith('g1', 'f1', { template: '{"id": 1}', format: 'json' });
  });

  it('gives the original message back after going round the formats', () => {
    const original = '{"id": "{{uuid}}", "t": {{temperature}}}';
    const roundFlow = { ...flow, id: 'round', format: 'json' as const };
    let template = original;
    const onTemplateChange = vi.fn((value: string) => { template = value; });
    const { rerender } = render(<FlowWorkspace flow={roundFlow} group={group} template={template} onTemplateChange={onTemplateChange} />);
    const seen: string[] = [];
    for (const label of ['XML', 'CSV', 'PLAIN', 'JSON', 'XML', 'CSV', 'PLAIN', 'JSON']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      const format = label.toLowerCase() as 'json' | 'xml' | 'csv' | 'plain';
      seen.push(template);
      rerender(<FlowWorkspace flow={{ ...roundFlow, format }} group={group} template={template} onTemplateChange={onTemplateChange} />);
    }
    expect(seen.slice(4)).toEqual(seen.slice(0, 4));
    expect(seen[3]).toBe(original);
  });

  it('only changes the format of an empty template or of JSON still being written', () => {
    const { rerender } = render(<FlowWorkspace flow={{ ...flow, format: 'json' }} group={group} template="" onTemplateChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'XML' }));
    expect(mockActions.updateFlowConfig).toHaveBeenLastCalledWith('g1', 'f1', { template: '', format: 'xml' });

    // Unfinished JSON in a flow stored as plain: switching to JSON keeps the text
    rerender(<FlowWorkspace flow={{ ...flow, format: 'plain' }} group={group} template={'{"id": '} onTemplateChange={vi.fn()} />);
    expect(currentFormatButton().map((b) => b.textContent)).toEqual(['PLAIN']);
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    expect(mockActions.updateFlowConfig).toHaveBeenLastCalledWith('g1', 'f1', { template: '{"id": ', format: 'json' });
    expect(mockToast.success).toHaveBeenLastCalledWith('Format set to JSON', expect.anything());
  });

  it('keeps the chosen format while the template is being written and explains why it cannot convert', () => {
    render(<FlowWorkspace flow={{ ...flow, format: 'json' }} group={group} template={'{"id": '} onTemplateChange={vi.fn()} />);
    expect(currentFormatButton().map((b) => b.textContent)).toEqual(['JSON']);

    fireEvent.click(screen.getByRole('button', { name: 'XML' }));
    expect(mockActions.updateFlowConfig).not.toHaveBeenCalled();
    expect(mockToast.warning).toHaveBeenCalledWith(
      'The template is not valid JSON yet: finish it before converting it.',
      expect.anything(),
    );
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

  it('resets the name draft when another flow is shown', () => {
    const other: Flow = { ...flow, id: 'f2', name: 'Other Flow', everyTicks: 3 };
    const groupWithFlows: Group = { ...group, flows: [flow, other] };
    const { rerender } = render(<FlowWorkspace flow={flow} group={groupWithFlows} template="T" onTemplateChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Flow name'), { target: { value: '' } });

    rerender(<FlowWorkspace flow={other} group={groupWithFlows} template="T" onTemplateChange={vi.fn()} />);
    expect(screen.getByLabelText('Flow name')).toHaveValue('Other Flow');
  });
});
