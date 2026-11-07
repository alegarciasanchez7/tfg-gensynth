import { render, screen } from '@testing-library/react';
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
});
