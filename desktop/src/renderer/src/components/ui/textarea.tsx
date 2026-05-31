import type { TextareaHTMLAttributes } from "react";

import { cn } from "@renderer/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 shadow-sm outline-none transition-colors placeholder:text-zinc-500 focus-visible:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
