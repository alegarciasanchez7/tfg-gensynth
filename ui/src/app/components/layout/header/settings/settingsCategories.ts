import type { ComponentType } from 'react';
import { Palette, RefreshCw, Save, Timer, type LucideIcon } from 'lucide-react';
import { AppearanceSettingsSection } from './AppearanceSettingsSection';
import { StorageSettingsSection } from './StorageSettingsSection';
import { TickSettingsSection } from './TickSettingsSection';
import { UpdatesSettingsSection } from './UpdatesSettingsSection';

export type SettingsCategoryId = 'appearance' | 'storage' | 'simulation' | 'updates';

export interface SettingsCategory {
  id: SettingsCategoryId;
  label: string;
  description: string;
  /** Where the settings of this category are kept. */
  scope: 'device' | 'project';
  icon: LucideIcon;
  Section: ComponentType;
}

/** Categories shown in the settings dialog. Add an entry here to add a new category. */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme of the application.',
    scope: 'device',
    icon: Palette,
    Section: AppearanceSettingsSection,
  },
  {
    id: 'storage',
    label: 'Save & Storage',
    description: 'How and when the configuration is saved, and where the generated files go.',
    scope: 'device',
    icon: Save,
    Section: StorageSettingsSection,
  },
  {
    id: 'simulation',
    label: 'Simulation',
    description: 'Global tick clock that sets the pace of message generation.',
    scope: 'project',
    icon: Timer,
    Section: TickSettingsSection,
  },
  {
    id: 'updates',
    label: 'About & Updates',
    description: 'Installed version and new releases. You always decide whether to update.',
    scope: 'device',
    icon: RefreshCw,
    Section: UpdatesSettingsSection,
  },
];
