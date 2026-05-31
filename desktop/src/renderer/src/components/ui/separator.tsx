import type { HTMLAttributes } from "react";

import { cn } from "@renderer/lib/utils";

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-zinc-200", className)} {...props} />;
}
