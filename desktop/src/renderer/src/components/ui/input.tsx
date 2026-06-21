import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "@renderer/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref,
) {
  return (
    <input
      className={cn(
        "flex h-7 w-full rounded-sm border border-input bg-card px-2 py-1 text-xs text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
