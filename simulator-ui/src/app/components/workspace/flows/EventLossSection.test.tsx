import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventLossSection } from './EventLossSection';

function renderSection(overrides: Partial<Parameters<typeof EventLossSection>[0]> = {}) {
  const onChange = vi.fn();
  const props = { lossPercent: 0, outageEveryTicks: 0, outageDurationTicks: 0, onChange, ...overrides };
  const view = render(<EventLossSection {...props} />);
  return { ...view, onChange: props.onChange };
}

function commit(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
}

describe('EventLossSection', () => {
  afterEach(() => cleanup());

  it('shows the three fields with their current values', () => {
    renderSection({ lossPercent: 12.5, outageEveryTicks: 10, outageDurationTicks: 2 });

    expect(screen.getByText('EVENT LOSS')).toBeInTheDocument();
    expect(screen.getByLabelText('Random loss (%)')).toHaveValue('12.5');
    expect(screen.getByLabelText('Outage every N ticks')).toHaveValue('10');
    expect(screen.getByLabelText('Outage length (ticks)')).toHaveValue('2');
  });

  it('commits on blur, not while typing', () => {
    const { onChange } = renderSection();
    const input = screen.getByLabelText('Random loss (%)');

    fireEvent.change(input, { target: { value: '25' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ lossPercent: 25 });
  });

  it('commits on Enter', () => {
    const { onChange } = renderSection();
    const input = screen.getByLabelText('Outage every N ticks');
    input.focus();

    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith({ outageEveryTicks: 8 });
  });

  it('clamps out-of-range values', () => {
    const { onChange } = renderSection({ outageEveryTicks: 4 });

    expect(commit('Random loss (%)', '150')).toHaveValue('100');
    expect(onChange).toHaveBeenCalledWith({ lossPercent: 100 });

    expect(commit('Outage length (ticks)', '-3')).toHaveValue('0');
    expect(commit('Outage every N ticks', '2.6')).toHaveValue('3');
    expect(onChange).toHaveBeenCalledWith({ outageEveryTicks: 3 });
    // -3 clamps to the current value 0, so nothing is reported for the length
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ outageDurationTicks: expect.anything() }));
  });

  it('reverts invalid text without reporting it', () => {
    const { onChange } = renderSection({ lossPercent: 5 });

    expect(commit('Random loss (%)', 'abc')).toHaveValue('5');
    expect(commit('Random loss (%)', '')).toHaveValue('5');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the new value when the flow changes', () => {
    const { rerender, onChange } = renderSection({ lossPercent: 5 });
    rerender(<EventLossSection lossPercent={40} outageEveryTicks={0} outageDurationTicks={0} onChange={onChange} />);

    expect(screen.getByLabelText('Random loss (%)')).toHaveValue('40');
  });

  it('warns when the outage covers the whole cycle', () => {
    const { rerender, onChange } = renderSection({ outageEveryTicks: 4, outageDurationTicks: 2 });
    expect(screen.queryByText(/every message of the flow is lost/)).not.toBeInTheDocument();

    rerender(<EventLossSection lossPercent={0} outageEveryTicks={4} outageDurationTicks={4} onChange={onChange} />);
    expect(screen.getByText(/every message of the flow is lost/)).toBeInTheDocument();

    rerender(<EventLossSection lossPercent={0} outageEveryTicks={0} outageDurationTicks={4} onChange={onChange} />);
    expect(screen.queryByText(/every message of the flow is lost/)).not.toBeInTheDocument();
  });
});
