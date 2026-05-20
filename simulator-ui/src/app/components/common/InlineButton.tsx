import * as React from "react";
import { cn } from "../ui/utils";

export type InlineButtonVariant = 'default' | 'active' | 'success' | 'danger' | 'ghost';

interface InlineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: InlineButtonVariant;
  isActive?: boolean;
}

export function InlineButton({
  className,
  variant = 'default',
  isActive = false,
  type = 'button',
  ...props
}: InlineButtonProps) {
  const baseClasses = "flex items-center justify-center rounded border text-[11px] font-mono transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variantClasses = {
    default: "border-[var(--c-br1)] text-[var(--c-tx3)] hover:text-[var(--c-tx1)] hover:border-[var(--c-br3)] hover:bg-[var(--c-bg5)]",
    active: "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20",
    danger: "border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/20",
    ghost: "border-transparent text-[var(--c-tx4)] hover:text-[var(--c-tx2)] hover:bg-[var(--c-bg5)]",
  }[isActive ? 'active' : variant];

  return (
    <button
      type={type}
      className={cn(baseClasses, variantClasses, className)}
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
      {...props}
    />
  );
}
