import { useEffect, useRef } from 'react';
import { X, Sun, Moon } from 'lucide-react';

interface SettingsPanelProps {
  isDark: boolean;
  onThemeToggle: () => void;
  onClose: () => void;
}

export function SettingsPanel({ isDark, onThemeToggle, onClose }: SettingsPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-xl shadow-black/20 min-w-52 py-2"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--c-br2)] mb-1">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase">Settings</span>
        <button onClick={onClose} className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors">
          <X size={10} />
        </button>
      </div>

      {/* Theme toggle */}
      <div className="px-3 py-1 text-[10px] text-[var(--c-tx4)] tracking-wider uppercase mb-0.5">
        Appearance
      </div>
      <button
        onClick={() => { onThemeToggle(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--c-bg5)] transition-colors group"
      >
        <span className="flex items-center justify-center w-6 h-6 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)] group-hover:border-cyan-500/40 group-hover:bg-cyan-500/10 transition-all">
          {isDark ? <Sun size={11} className="text-amber-400" /> : <Moon size={11} className="text-violet-400" />}
        </span>
        <div className="flex flex-col gap-0">
          <span className="text-[11px] text-[var(--c-tx2)]">
            {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </span>
          <span className="text-[10px] text-[var(--c-tx4)]">
            Currently: {isDark ? 'Dark' : 'Light'}
          </span>
        </div>
      </button>

      {/* Divider */}
      <div className="h-px bg-[var(--c-br2)] my-1.5" />

      {/* Version info */}
      <div className="px-3 py-1.5">
        <span className="text-[10px] text-[var(--c-tx5)]">GenSynth v1.0.0-beta</span>
      </div>
    </div>
  );
}
