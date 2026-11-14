import { Moon, Sun } from 'lucide-react';
import { useApp } from '../../../../context';
import { Switch } from '../../../ui/switch';
import { SettingRow } from './SettingRow';

/**
 * Appearance settings: light / dark theme. Stored on this device.
 */
export function AppearanceSettingsSection() {
  const { state, actions } = useApp();

  return (
    <div className="flex flex-col gap-2">
      <SettingRow
        icon={state.isDark ? <Moon size={12} className="text-violet-400" /> : <Sun size={12} className="text-amber-400" />}
        title="Dark mode"
        description={`Currently using the ${state.isDark ? 'dark' : 'light'} theme`}
        htmlFor="settings-dark-mode"
      >
        <Switch
          id="settings-dark-mode"
          aria-label="Dark mode"
          checked={state.isDark}
          onCheckedChange={() => actions.toggleTheme()}
          className="data-[state=checked]:bg-cyan-500"
        />
      </SettingRow>
    </div>
  );
}
