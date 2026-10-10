import { useEffect, useState } from 'react';
import { Save, Timer } from 'lucide-react';
import { useApp } from '../../../../context';
import { AUTO_SAVE_MAX_SECONDS, AUTO_SAVE_MIN_SECONDS, clampAutoSaveInterval } from '../../../../context/reducer';
import { supportsFileSystemAccess } from '../../../../core/fileStorage';
import { Switch } from '../../../ui/switch';
import { Input } from '../../../ui/input';
import { SettingRow } from './SettingRow';

/**
 * Save & storage settings: auto-save switch and interval. Stored on this device.
 */
export function StorageSettingsSection() {
  const { state, actions } = useApp();
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

  return (
    <div className="flex flex-col gap-2">
      <SettingRow
        icon={<Save size={12} className="text-cyan-400" />}
        title="Auto-save"
        description={state.autoSaveEnabled
          ? `Every ${state.autoSaveIntervalSeconds}s to the open file`
          : 'Off: save manually'}
        htmlFor="settings-auto-save"
      >
        <Switch
          id="settings-auto-save"
          aria-label="Auto-save"
          checked={state.autoSaveEnabled}
          onCheckedChange={(checked) => actions.setAutoSave(checked)}
          className="data-[state=checked]:bg-cyan-500"
        />
      </SettingRow>

      {state.autoSaveEnabled && (
        <SettingRow
          icon={<Timer size={12} className="text-cyan-400" />}
          title="Interval (seconds)"
          description={`Between ${AUTO_SAVE_MIN_SECONDS} and ${AUTO_SAVE_MAX_SECONDS} seconds`}
          htmlFor="settings-auto-save-interval"
        >
          <Input
            id="settings-auto-save-interval"
            type="number"
            aria-label="Auto-save interval in seconds"
            min={AUTO_SAVE_MIN_SECONDS}
            max={AUTO_SAVE_MAX_SECONDS}
            step={1}
            value={intervalDraft}
            onChange={(e) => setIntervalDraft(e.target.value)}
            onBlur={commitInterval}
            onKeyDown={(e) => { if (e.key === 'Enter') commitInterval(); }}
            className="h-7 w-24 px-2 text-[11px] md:text-[11px] text-right bg-[var(--c-bg4)] border-[var(--c-br1)] text-[var(--c-tx1)]"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          />
        </SettingRow>
      )}

      {autoSaveHint && (
        <span className="text-[10px] text-amber-400 px-1">{autoSaveHint}</span>
      )}
    </div>
  );
}
