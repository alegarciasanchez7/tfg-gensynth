import { useState, type ComponentType } from 'react';
import { Palette, Save, Timer, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../ui/dialog';
import { AppearanceSettingsSection } from './AppearanceSettingsSection';
import { StorageSettingsSection } from './StorageSettingsSection';
import { TickSettingsSection } from './TickSettingsSection';

export type SettingsCategoryId = 'appearance' | 'storage' | 'simulation';

interface SettingsCategory {
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
    description: 'How and when the configuration is saved to its file.',
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
];

const SCOPE_LABELS: Record<SettingsCategory['scope'], string> = {
  device: 'Stored on this device',
  project: 'Saved with the project',
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategory?: SettingsCategoryId;
}

/**
 * Large centered settings dialog with a category navigation on the left
 * and the settings of the selected category on the right.
 */
export function SettingsDialog({ open, onOpenChange, initialCategory = 'appearance' }: SettingsDialogProps) {
  const [activeId, setActiveId] = useState<SettingsCategoryId>(initialCategory);
  const active = SETTINGS_CATEGORIES.find((category) => category.id === activeId) ?? SETTINGS_CATEGORIES[0];
  const ActiveSection = active.Section;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl w-[90vw] h-[70vh] max-h-[640px] min-h-[380px] p-0 gap-0 flex overflow-hidden rounded-xl bg-[var(--c-bg2)] border-[var(--c-br1)] text-[var(--c-tx2)]"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        <nav
          aria-label="Settings categories"
          className="w-48 sm:w-56 shrink-0 flex flex-col border-r border-[var(--c-br1)] bg-[var(--c-bg3)]"
        >
          <DialogTitle className="px-4 pt-4 pb-3 text-[9px] font-normal leading-none text-[var(--c-tx5)] tracking-widest uppercase">
            Settings
          </DialogTitle>
          <div className="flex flex-col">
            {SETTINGS_CATEGORIES.map(({ id, label, icon: Icon }) => {
              const selected = id === active.id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => setActiveId(id)}
                  className={`flex items-center gap-2.5 px-4 py-2 text-left text-[11px] border-l-2 transition-colors ${
                    selected
                      ? 'bg-cyan-500/10 border-l-cyan-500 text-[var(--c-tx1)]'
                      : 'border-l-transparent text-[var(--c-tx3)] hover:bg-cyan-500/5 hover:text-[var(--c-tx1)]'
                  }`}
                >
                  <Icon size={13} className={selected ? 'text-cyan-400' : 'text-[var(--c-tx4)]'} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-auto px-4 py-3 text-[10px] text-[var(--c-tx5)]">GenSynth 0.5.0-alpha</div>
        </nav>

        <section className="flex-1 min-w-0 flex flex-col">
          <header className="px-6 pt-5 pb-4 pr-12 border-b border-[var(--c-br2)]">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm text-[var(--c-tx1)] font-semibold">{active.label}</h2>
              <span className="rounded border border-[var(--c-br2)] bg-[var(--c-bg1)] px-1.5 py-0.5 text-[9px] text-[var(--c-tx4)] uppercase tracking-wider">
                {SCOPE_LABELS[active.scope]}
              </span>
            </div>
            <DialogDescription className="mt-1 text-[10px] text-[var(--c-tx4)]">
              {active.description}
            </DialogDescription>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <ActiveSection />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
