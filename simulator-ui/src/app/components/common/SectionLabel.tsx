import * as React from "react";
import { cn } from "../ui/utils";

interface SectionLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export function SectionLabel({ className, children, ...props }: SectionLabelProps) {
  return (
    <span
      className={cn("text-[9px] text-[var(--c-tx5)] tracking-widest uppercase font-mono", className)}
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
      {...props}
    >
      {children}
    </span>
  );
}
