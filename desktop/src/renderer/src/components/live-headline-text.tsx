import type { ReactNode } from "react";

import { cn } from "../lib/utils";

export function LiveHeadlineText({
  active,
  children,
  className,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (children === "") {
    return null;
  }
  return (
    <span
      className={cn("live-headline-text", className)}
      data-live-headline={active ? "active" : "idle"}
      data-live-headline-text={typeof children === "string" ? children : undefined}
    >
      {children}
    </span>
  );
}
