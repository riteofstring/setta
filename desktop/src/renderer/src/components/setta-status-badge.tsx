import type { ComponentProps } from "react";

import { cn } from "@renderer/lib/utils";

import { Badge } from "./ui/badge";

/**
 * Setta status semantics for the official Badge. The shadcn variants describe
 * emphasis, not domain state, so anything reporting connection, account, or
 * provider health picks a tone here and renders through Setta's status tokens.
 */
export type SettaStatusTone = "danger" | "info" | "neutral" | "success" | "warning";

const statusToneClasses = {
  danger: "border-status-critical/40 bg-status-critical/10 text-status-critical",
  info: "border-status-info/40 bg-status-info/10 text-status-info",
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-status-success/40 bg-status-success/10 text-status-success",
  warning: "border-status-warning/40 bg-status-warning/10 text-status-warning",
} satisfies Record<SettaStatusTone, string>;

export function SettaStatusBadge({
  className,
  tone,
  ...props
}: ComponentProps<typeof Badge> & { tone: SettaStatusTone }) {
  return <Badge className={cn(statusToneClasses[tone], className)} variant="outline" {...props} />;
}
