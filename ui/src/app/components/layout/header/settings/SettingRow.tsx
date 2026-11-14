import type { ReactNode } from 'react';

interface SettingRowProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  /** Id of the control, so clicking the title focuses it. */
  htmlFor?: string;
  /** The control (switch, input...) shown on the right. */
  children?: ReactNode;
}

/**
 * One row of the settings dialog: icon, title and description on the left, control on the right.
 */
export function SettingRow({ icon, title, description, htmlFor, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--c-br2)] bg-[var(--c-bg1)] px-3 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded border border-[var(--c-br1)] bg-[var(--c-bg4)]">
          {icon}
        </span>
        <div className="flex flex-col min-w-0">
          <label htmlFor={htmlFor} className="text-[11px] text-[var(--c-tx1)] font-medium">
            {title}
          </label>
          {description && <span className="text-[10px] text-[var(--c-tx4)]">{description}</span>}
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
