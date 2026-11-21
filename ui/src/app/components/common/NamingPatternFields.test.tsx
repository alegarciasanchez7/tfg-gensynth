import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NamingPatternFields } from './NamingPatternFields';

function Harness({ initialCount = '2', onSubmit }: { initialCount?: string; onSubmit?: () => void }) {
  const [count, setCount] = useState(initialCount);
  const [pattern, setPattern] = useState('${name} ${index}');
  return (
    <NamingPatternFields
      count={count}
      onCountChange={setCount}
      pattern={pattern}
      onPatternChange={setPattern}
      itemName="Sensor"
      countLabel="Number of flows"
      itemsNoun="flows"
      onSubmit={onSubmit}
    />
  );
}

describe('NamingPatternFields', () => {
  afterEach(() => cleanup());

  it('previews the generated names', () => {
    render(<Harness />);
    expect(screen.getByText('Sensor 1')).toBeInTheDocument();
    expect(screen.getByText('Sensor 2')).toBeInTheDocument();
  });

  it('shows at most three names and summarizes the rest', () => {
    render(<Harness initialCount="5" />);
    expect(screen.getByText('Sensor 3')).toBeInTheDocument();
    expect(screen.queryByText('Sensor 4')).not.toBeInTheDocument();
    expect(screen.getByText('... and 2 more flows')).toBeInTheDocument();
  });

  it('inserts placeholders and submits on Enter', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Naming Pattern');
    fireEvent.change(input, { target: { value: 'node-' } });
    fireEvent.click(screen.getByText('+ ${index}'));
    expect(input).toHaveValue('node-${index}');
    expect(screen.getByText('node-1')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows no preview for an invalid quantity', () => {
    render(<Harness initialCount="0" />);
    expect(screen.queryByText('Live Preview')).not.toBeInTheDocument();
  });
});
