import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitInput } from './CommitInput';

const renderInput = (value: string, onCommit: (raw: string) => boolean) =>
  render(<CommitInput value={value} onCommit={onCommit} ariaLabel="Steps" className="" />);

describe('CommitInput', () => {
  it('commits once on blur, not on every keystroke', () => {
    const onCommit = vi.fn(() => true);
    renderInput('10', onCommit);
    const input = screen.getByLabelText('Steps');

    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('12');
  });

  it('commits on Enter', () => {
    const onCommit = vi.fn(() => true);
    renderInput('10', onCommit);
    const input = screen.getByLabelText('Steps');
    input.focus();

    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('7');
  });

  it('does not commit an unchanged value', () => {
    const onCommit = vi.fn(() => true);
    renderInput('10', onCommit);
    fireEvent.blur(screen.getByLabelText('Steps'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('restores the value when the commit is rejected', () => {
    renderInput('10', () => false);
    const input = screen.getByLabelText('Steps');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('10');
  });

  it('follows a value changed from outside', () => {
    const onCommit = vi.fn(() => true);
    const { rerender } = renderInput('10', onCommit);
    rerender(<CommitInput value="25" onCommit={onCommit} ariaLabel="Steps" className="" />);
    expect(screen.getByLabelText('Steps')).toHaveValue('25');
  });

  it('keeps text typed after a commit when the echo of that commit arrives', () => {
    const onCommit = vi.fn(() => true);
    const { rerender } = renderInput('10', onCommit);
    const input = screen.getByLabelText('Steps');

    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    // The user types again before the Core answers with the committed "5"
    fireEvent.change(input, { target: { value: '56' } });
    rerender(<CommitInput value="5" onCommit={onCommit} ariaLabel="Steps" className="" />);

    expect(input).toHaveValue('56');
  });

  it('keeps the draft when an unrelated update re-renders with the same value', () => {
    const onCommit = vi.fn(() => true);
    const { rerender } = renderInput('10', onCommit);
    const input = screen.getByLabelText('Steps');

    fireEvent.change(input, { target: { value: '3' } });
    rerender(<CommitInput value="10" onCommit={onCommit} ariaLabel="Steps" className="" />);

    expect(input).toHaveValue('3');
  });
});
