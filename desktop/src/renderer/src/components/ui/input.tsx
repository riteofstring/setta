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
        "flex h-7 w-full rounded-sm border border-zinc-300 bg-white px-2 py-1 text-xs shadow-sm outline-none transition-colors placeholder:text-zinc-500 focus-visible:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
