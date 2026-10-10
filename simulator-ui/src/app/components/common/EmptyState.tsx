import * as React from "react";
import { cn } from "../ui/utils";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
}

export function EmptyState({ className, title = "Void Space", message, ...props }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-8 text-[var(--c-tx4)] px-4 text-center", className)} {...props}>
      <span className="text-[9px] uppercase tracking-tighter opacity-50 mb-2 font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {title}
      </span>
      <span className="text-[10px] italic">
        {message}
      </span>
    </div>
  );
}
