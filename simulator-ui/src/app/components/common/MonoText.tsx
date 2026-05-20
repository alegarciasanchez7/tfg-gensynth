import * as React from "react";
import { cn } from "../ui/utils";

interface MonoTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "9px" | "10px" | "11px" | "xs" | "sm";
}

export function MonoText({ className, size = "xs", ...props }: MonoTextProps) {
  const sizeClass = {
    "9px": "text-[9px]",
    "10px": "text-[10px]",
    "11px": "text-[11px]",
    "xs": "text-xs",
    "sm": "text-sm",
  }[size];

  return (
    <span
      className={cn("font-mono", sizeClass, className)}
      style={{ fontFamily: 'JetBrains Mono, monospace' }}
      {...props}
    />
  );
}
