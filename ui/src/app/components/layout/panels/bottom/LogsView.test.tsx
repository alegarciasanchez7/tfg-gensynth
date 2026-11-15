import { fireEvent, render, screen } from '@testing-library/react';
import type { Group } from '../../../../types';
import { describe, expect, it } from 'vitest';
import { LogsView } from './LogsView';

describe('LogsView', () => {
  it('shows a message laid out on several lines with its line breaks', () => {
    const message = '[G - F] ==> {\n  "posicion": {\n    "x": 1.5\n  }\n}';
    render(
      <LogsView
        entries={[{ id: '1', timestamp: '10:00:00', level: 'data', source: 'f1', message }]}
        connectorHealthSummary={[]}
        groups={[]}
      />
    );

    const text = screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === message);
    expect(text).toHaveClass('whitespace-pre-wrap');
  });

  it('shows all the flows again when the group filter changes', () => {
    const groups = [
      { id: 'g1', name: 'A', flows: [{ id: 'f1', name: 'F1' }] },
      { id: 'g2', name: 'B', flows: [{ id: 'f2', name: 'F2' }] },
    ] as unknown as Group[];
    render(<LogsView entries={[]} connectorHealthSummary={[]} groups={groups} />);

    fireEvent.change(screen.getByLabelText('filter-group'), { target: { value: 'g1' } });
    fireEvent.change(screen.getByLabelText('filter-flow'), { target: { value: 'f1' } });
    expect(screen.getByLabelText('filter-flow')).toHaveValue('f1');

    fireEvent.change(screen.getByLabelText('filter-group'), { target: { value: 'g2' } });
    expect(screen.getByLabelText('filter-flow')).toHaveValue('all');
  });

  it('keeps the session folder visible whatever the filters show', () => {
    render(
      <LogsView
        entries={[{ id: '1', timestamp: '10:00:00', level: 'data', source: 'f1', message: 'a message' }]}
        connectorHealthSummary={[]}
        groups={[]}
        sessionOutputDir="/home/ana/GenSynth/OUTPUT_FILES_1"
      />
    );

    fireEvent.click(screen.getByText('only data'));
    fireEvent.click(screen.getByText('INFO'));

    expect(screen.queryByText('a message')).not.toBeInTheDocument();
    expect(screen.getByText('/home/ana/GenSynth/OUTPUT_FILES_1')).toBeInTheDocument();
  });
});
