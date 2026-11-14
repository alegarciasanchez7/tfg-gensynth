import * as React from "react";
import { cn } from "../ui/utils";

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  description?: string;
  className?: string;
}

export function FieldRow({ label, children, description, className }: FieldRowProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        className="text-[10px] text-[var(--c-tx4)] tracking-wider uppercase font-mono"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
      >
        {label}
      </label>
      {children}
      {description && (
        <span className="text-[9px] text-[var(--c-tx4)]">
          {description}
        </span>
      )}
    </div>
  );
}
