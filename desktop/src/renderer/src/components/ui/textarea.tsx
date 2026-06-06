import type { TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "@renderer/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      className={cn(
        "flex min-h-12 w-full rounded-sm border border-zinc-300 bg-white px-2 py-1.5 text-xs leading-4 shadow-sm outline-none transition-colors placeholder:text-zinc-500 focus-visible:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
