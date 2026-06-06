import { createContext, useContext, useState, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@renderer/lib/utils";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <span
        className="relative inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  const { setOpen } = useTooltipContext();

  return (
    <span
      className={cn("inline-flex", className)}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      {...props}
    >
      {children}
    </span>
  );
}

export function TooltipContent({
  children,
  className,
  side = "bottom",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  side?: "bottom" | "top";
}) {
  const { open } = useTooltipContext();

  if (!open) {
    return null;
  }

  return (
    <span
      className={cn(
        "pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 rounded-sm border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md",
        side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
        className,
      )}
      role="tooltip"
      {...props}
    >
      {children}
    </span>
  );
}

function useTooltipContext(): TooltipContextValue {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error("Tooltip components must be rendered inside Tooltip");
  }
  return context;
}
