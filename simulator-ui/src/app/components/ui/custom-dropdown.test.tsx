import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomDropdown } from './custom-dropdown';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

function Controlled({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('a');
  return (
    // An ancestor that clips its overflow, like the scrollable list of List items
    <div data-testid="clipping-ancestor" style={{ overflow: 'hidden', height: 20 }}>
      <CustomDropdown
        id="dd"
        value={value}
        onChange={next => { setValue(next); onChange(next); }}
        options={options}
      />
    </div>
  );
}

const trigger = () => document.getElementById('dd') as HTMLButtonElement;
const menu = () => screen.queryByTestId('custom-dropdown-menu');

const placeTrigger = (top: number, height = 32) => {
  vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue({
    top, bottom: top + height, left: 40, right: 200, width: 160, height, x: 40, y: top, toJSON: () => ({}),
  } as DOMRect);
};

afterEach(() => vi.restoreAllMocks());

describe('CustomDropdown', () => {
  it('renders the menu in document.body so no ancestor overflow can clip it', () => {
    render(<Controlled />);
    fireEvent.click(trigger());

    expect(menu()).toBeInTheDocument();
    expect(menu()?.parentElement).toBe(document.body);
    expect(screen.getByTestId('clipping-ancestor')).not.toContainElement(menu());
    expect(menu()).toHaveStyle({ position: 'fixed' });
  });

  it('picks an option on click and closes', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));

    expect(onChange).toHaveBeenCalledWith('b');
    expect(menu()).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Beta');
  });

  it('opens below the trigger when there is room, and above it when there is not', () => {
    render(<Controlled />);
    placeTrigger(100);
    fireEvent.click(trigger());
    expect(menu()?.style.top).toBe(`${100 + 32 + 4}px`);
    expect(menu()?.style.bottom).toBe('');
    fireEvent.click(trigger());

    placeTrigger(window.innerHeight - 40);
    fireEvent.click(trigger());
    expect(menu()?.style.top).toBe('');
    expect(menu()?.style.bottom).toBe(`${40 + 4}px`);
  });

  it('closes on outside click, scroll and resize, but not when its own list scrolls', () => {
    render(<Controlled />);
    fireEvent.click(trigger());
    fireEvent.scroll(menu()!);
    expect(menu()).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(menu()).not.toBeInTheDocument();

    fireEvent.click(trigger());
    fireEvent.scroll(window);
    expect(menu()).not.toBeInTheDocument();

    fireEvent.click(trigger());
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(menu()).not.toBeInTheDocument();
  });

  it('closes with Escape without letting an enclosing dialog see it', () => {
    const outerEscape = vi.fn();
    document.addEventListener('keydown', outerEscape);
    render(<Controlled />);
    fireEvent.click(trigger());

    fireEvent.keyDown(trigger(), { key: 'Escape' });

    expect(menu()).not.toBeInTheDocument();
    expect(outerEscape).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outerEscape);
  });

  it('opens, moves and picks with the keyboard', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(menu()).toBeInTheDocument();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(trigger(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('c');
    expect(menu()).not.toBeInTheDocument();
  });

  it('works inside a modal dialog without closing it', () => {
    const onChange = vi.fn();
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Configure Item</DialogTitle>
          <DialogDescription>Generator</DialogDescription>
          <CustomDropdown id="dd" value="a" onChange={onChange} options={options} />
        </DialogContent>
      </Dialog>,
    );
    fireEvent.click(trigger());
    // The modal disables pointer events on the body: the menu re-enables them for itself
    expect(menu()).toHaveStyle({ pointerEvents: 'auto' });

    const option = screen.getByRole('option', { name: 'Gamma' });
    fireEvent.pointerDown(option);
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
