import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CustomDropdownOption {
  value: string;
  label: string;
}

export interface CustomDropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: CustomDropdownOption[];
  label?: string;
  className?: string;
  /** Classes of the trigger button, replacing the default look (e.g. a compact trigger). */
  triggerClassName?: string;
}

/** Fixed (viewport) position of the open menu. */
interface DropdownMenuPosition {
  left: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  /** Set when the menu opens below the trigger. */
  top?: number;
  /** Set when the menu opens above the trigger (distance from the viewport bottom). */
  bottom?: number;
}

const MENU_MAX_HEIGHT = 200;
const MENU_MIN_HEIGHT = 64;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

const DEFAULT_TRIGGER_CLASS = 'flex h-8 w-full items-center justify-between rounded-md border border-input bg-input-background dark:bg-input/30 dark:hover:bg-input/50 px-3 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer';

/**
 * Where to show the menu of a trigger: below it, or above it when there is not enough room
 * below and there is more room above. The height is limited to the available room.
 */
function dropdownMenuPosition(trigger: DOMRect, viewportWidth: number, viewportHeight: number): DropdownMenuPosition {
  const roomBelow = viewportHeight - trigger.bottom - MENU_GAP - VIEWPORT_MARGIN;
  const roomAbove = trigger.top - MENU_GAP - VIEWPORT_MARGIN;
  const openUp = roomBelow < MENU_MAX_HEIGHT && roomAbove > roomBelow;
  const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, openUp ? roomAbove : roomBelow));
  const left = Math.max(VIEWPORT_MARGIN, trigger.left);
  const horizontal = {
    left,
    minWidth: trigger.width,
    maxWidth: Math.max(trigger.width, viewportWidth - left - VIEWPORT_MARGIN),
    maxHeight,
  };
  return openUp
    ? { ...horizontal, bottom: viewportHeight - trigger.top + MENU_GAP }
    : { ...horizontal, top: trigger.bottom + MENU_GAP };
}

/**
 * Select-like dropdown. The menu is rendered in a portal on document.body with fixed positioning,
 * so no ancestor with overflow hidden/auto can clip it. It flips upwards when there is no room
 * below, and closes on outside click, Escape, scroll, resize or when the trigger loses focus.
 * Keyboard: ArrowUp/ArrowDown open the menu and move the highlight, Enter/Space pick it.
 */
export const CustomDropdown: React.FC<CustomDropdownProps> = ({ value, onChange, options, id, className = '', triggerClassName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<DropdownMenuPosition | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex(opt => opt.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const close = useCallback(() => setIsOpen(false), []);

  const open = () => {
    setHighlighted(Math.max(0, selectedIndex));
    setIsOpen(true);
  };

  const pick = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  // Place the menu next to the trigger before the browser paints it
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPosition(null);
      return;
    }
    setPosition(dropdownMenuPosition(triggerRef.current.getBoundingClientRect(), window.innerWidth, window.innerHeight));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && (!!triggerRef.current?.contains(target) || !!menuRef.current?.contains(target));
    const handleMouseDown = (event: MouseEvent) => {
      if (!isInside(event.target)) close();
    };
    // A scrolled ancestor would leave the fixed menu behind: close it (scrolling the menu itself is fine)
    const handleScroll = (event: Event) => {
      if (!(event.target instanceof Node && menuRef.current?.contains(event.target))) close();
    };
    // Capture phase on window, so the first Escape only closes the menu and not an enclosing dialog
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, close]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (options.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        open();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted(prev => (prev + step + options.length) % options.length);
    } else if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault();
      if (highlighted >= 0 && highlighted < options.length) pick(options[highlighted].value);
    } else if (event.key === 'Tab' && isOpen) {
      close();
    }
  };

  const menu = isOpen && position && (
    <div
      ref={menuRef}
      data-testid="custom-dropdown-menu"
      // Keep the focus on the trigger (inside dialogs, a focused portal would fight their focus trap)
      onMouseDown={event => event.preventDefault()}
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        bottom: position.bottom,
        minWidth: position.minWidth,
        maxWidth: position.maxWidth,
        maxHeight: position.maxHeight,
        // A modal dialog disables pointer events on the body: the menu must still be clickable
        pointerEvents: 'auto',
      }}
      className="z-[100050] bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--c-br3)]"
    >
      <div className="p-1 space-y-0.5">
        {options.map((opt, index) => (
          <button
            key={opt.value}
            type="button"
            tabIndex={-1}
            data-highlighted={index === highlighted ? '' : undefined}
            onMouseEnter={() => setHighlighted(index)}
            onClick={() => pick(opt.value)}
            className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
              opt.value === value
                ? 'bg-violet-500/20 text-violet-400 font-semibold'
                : 'hover:bg-white/5 text-[var(--c-tx2)]'
            } ${index === highlighted ? 'ring-1 ring-inset ring-violet-500/40' : ''}`}
          >
            <span>{opt.label}</span>
            {opt.value === value && (
              <svg
                className="size-3.5 text-violet-400 shrink-0 ml-1"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
        onBlur={close}
        className={triggerClassName ?? DEFAULT_TRIGGER_CLASS}
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <svg
          className={`size-3.5 opacity-60 transition-transform duration-200 shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
};
