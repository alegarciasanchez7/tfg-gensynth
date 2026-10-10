import * as React from "react";
import { cn } from "../ui/utils";

export type StatusDotType = 'connected' | 'disconnected' | 'error' | 'warning' | 'running' | 'stopped' | 'success' | 'idle' | 'processing';

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusDotType;
  size?: 'sm' | 'md';
}

export function StatusDot({ className, status, size = 'sm', ...props }: StatusDotProps) {
  const dotColorClass = {
    connected: 'bg-emerald-400',
    running: 'bg-emerald-400',
    success: 'bg-emerald-400',
    disconnected: 'bg-slate-400',
    stopped: 'bg-slate-400',
    idle: 'bg-slate-400',
    error: 'bg-red-400',
    warning: 'bg-amber-400',
    processing: 'bg-amber-400',
  }[status] || 'bg-slate-400';

  const pulse = ['connected', 'running', 'processing'].includes(status);
  const sizeClass = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span className={cn("relative flex shrink-0", sizeClass, className)} {...props}>
      <span className={cn("rounded-full w-full h-full", dotColorClass, pulse && "animate-pulse")} />
    </span>
  );
}
