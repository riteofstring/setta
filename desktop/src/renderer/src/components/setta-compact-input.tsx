import type { ComponentProps } from "react";

import { cn } from "@renderer/lib/utils";

import { Input } from "./ui/input";

/**
 * The official Input is a 32px control with 14px text. Settings, runtime, and
 * credential surfaces are dense enough to need the shorter control, so they
 * share this sizing wrapper instead of restating the same overrides.
 */
export function SettaCompactInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn("h-7 px-2 text-xs md:text-xs", className)} {...props} />;
}
