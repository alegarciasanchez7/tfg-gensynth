import React, { useState, useEffect, useRef } from 'react';

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
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({ value, onChange, options, id, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-input-background dark:bg-input/30 dark:hover:bg-input/50 px-3 py-1 text-xs text-[var(--c-tx2)] outline-none hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <svg
          className={`size-3.5 opacity-60 transition-transform duration-200 shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--c-br3)]">
          <div className="p-1 space-y-0.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors flex items-center justify-between cursor-pointer ${
                  opt.value === value
                    ? 'bg-violet-500/20 text-violet-400 font-semibold'
                    : 'hover:bg-white/5 text-[var(--c-tx2)]'
                }`}
              >
                <span>{opt.label}</span>
                {opt.value === value && (
                  <svg
                    className="size-3.5 text-violet-400 shrink-0 ml-1"
                    xmlns="http://www.w3.org/2000/svg"
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
      )}
    </div>
  );
};
