import { useEffect, useRef, useState } from 'react';
import { X, Sun, Moon, Save, Timer } from 'lucide-react';
import { useApp } from '../../../context';
import { AUTO_SAVE_MAX_SECONDS, AUTO_SAVE_MIN_SECONDS, clampAutoSaveInterval } from '../../../context/reducer';
import { supportsFileSystemAccess } from '../../../core/fileStorage';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';

interface SettingsPanelProps {
  isDark: boolean;
  onThemeToggle: () => void;
  onClose: () => void;
}

export function SettingsPanel({ isDark, onThemeToggle, onClose }: SettingsPanelProps) {
  const { state, actions } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [intervalDraft, setIntervalDraft] = useState(String(state.autoSaveIntervalSeconds));

  useEffect(() => {
    setIntervalDraft(String(state.autoSaveIntervalSeconds));
  }, [state.autoSaveIntervalSeconds]);

  const commitInterval = () => {
    const seconds = Number(intervalDraft);
    if (intervalDraft.trim() === '' || !Number.isFinite(seconds)) {
      setIntervalDraft(String(state.autoSaveIntervalSeconds));
      return;
    }
    const clamped = clampAutoSaveInterval(seconds);
    actions.setAutoSaveInterval(clamped);
    // Reflect the clamped value even if the stored interval did not change
    setIntervalDraft(String(clamped));
  };

  const isDesktop = state.connectionMode === 'jcef';
  const canSaveInPlace = isDesktop || supportsFileSystemAccess();
  const hasOpenFile = isDesktop ? Boolean(state.currentFilePath) : Boolean(state.currentFileHandle);
  const autoSaveHint = !state.autoSaveEnabled
    ? null
    : !canSaveInPlace
      ? 'Not supported by this browser. Use Save manually.'
      : !hasOpenFile
        ? 'Save the configuration to a file to start auto-saving.'
        : null;

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
      className="absolute right-0 top-full mt-1 z-[100] bg-[var(--c-bg2)] border border-[var(--c-br1)] rounded shadow-2xl shadow-black/40 min-w-60 py-2"
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--c-br2)] mb-1">
        <span className="text-[10px] text-[var(--c-tx4)] tracking-widest uppercase">Settings</span>
        <button onClick={onClose} className="text-[var(--c-tx4)] hover:text-[var(--c-tx2)] transition-colors">
          <X size={10} />
        </button>
      </div>

      {/* Save Settings */}
      <div className="px-3 py-1 text-[10px] text-[var(--c-tx4)] tracking-wider uppercase mb-0.5">
        Save & Storage
      </div>
      <div className="flex items-center justify-between px-3 py-2 hover:bg-[var(--c-bg5)] transition-colors">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-6 h-6 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)]">
            <Save size={11} className="text-cyan-400" />
          </span>
          <div className="flex flex-col">
            <span className="text-[11px] text-[var(--c-tx2)] font-medium">Auto-save</span>
            <span className="text-[9px] text-[var(--c-tx4)]">
              {state.autoSaveEnabled
                ? `Every ${state.autoSaveIntervalSeconds}s to the open file`
                : 'Off: save manually'}
            </span>
          </div>
        </div>
        <Switch
          aria-label="Auto-save"
          checked={state.autoSaveEnabled}
          onCheckedChange={(checked) => actions.setAutoSave(checked)}
        />
      </div>
      {state.autoSaveEnabled && (
        <div className="flex flex-col gap-1 px-3 py-2">
          <label className="flex items-center justify-between gap-2.5">
            <span className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-6 h-6 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)]">
                <Timer size={11} className="text-cyan-400" />
              </span>
              <span className="text-[11px] text-[var(--c-tx2)]">Interval (seconds)</span>
            </span>
            <Input
              type="number"
              aria-label="Auto-save interval in seconds"
              min={AUTO_SAVE_MIN_SECONDS}
              max={AUTO_SAVE_MAX_SECONDS}
              step={1}
              value={intervalDraft}
              onChange={(e) => setIntervalDraft(e.target.value)}
              onBlur={commitInterval}
              onKeyDown={(e) => { if (e.key === 'Enter') commitInterval(); }}
              className="h-7 w-20 px-2 text-[11px] md:text-[11px] text-right bg-[var(--c-bg4)] border-[var(--c-br1)] text-[var(--c-tx1)]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            />
          </label>
          {autoSaveHint && (
            <span className="text-[9px] text-amber-400">{autoSaveHint}</span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-[var(--c-br2)] my-1.5" />

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
