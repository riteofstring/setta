import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { cn } from "@renderer/lib/utils";

export function AccordionSection({
  children,
  className,
  contentClassName,
  defaultOpen = false,
  subtitle,
  title,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  subtitle?: string;
  title: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("min-w-0", className)}>
      <button
        aria-expanded={open}
        className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded px-1 text-left text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{title}</span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-[11px] leading-none text-zinc-600">
              {subtitle}
            </span>
          ) : null}
        </span>
      </button>
      {open ? <div className={cn("min-w-0 pl-5", contentClassName)}>{children}</div> : null}
    </section>
  );
}
