import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@renderer/lib/utils";

import { Badge } from "./ui/badge";

/**
 * Setta status semantics for the official Badge. The shadcn variants describe
 * emphasis, not domain state, so anything reporting connection, account, or
 * provider health picks a tone here. Text stays on the validated card colour
 * pair; status tokens mark the border, while distinct icons and screen-reader
 * copy keep the meaning from depending on colour.
 */
export type SettaStatusTone = "danger" | "info" | "neutral" | "success" | "warning";

type StatusTonePresentation = {
  className: string;
  icon: LucideIcon | null;
  label: string | null;
};

const statusTonePresentation = {
  danger: {
    className: "border-[var(--graph-mode-fail)]/45 bg-transparent text-foreground",
    icon: CircleAlertIcon,
    label: "Danger",
  },
  info: {
    className: "border-[var(--graph-mode-think)]/45 bg-transparent text-foreground",
    icon: InfoIcon,
    label: "Information",
  },
  neutral: {
    className: "border-border bg-transparent text-muted-foreground",
    icon: null,
    label: null,
  },
  success: {
    className: "border-[var(--graph-mode-success)]/45 bg-transparent text-foreground",
    icon: CircleCheckIcon,
    label: "Success",
  },
  warning: {
    className: "border-[var(--graph-mode-risk)]/45 bg-transparent text-foreground",
    icon: TriangleAlertIcon,
    label: "Warning",
  },
} satisfies Record<SettaStatusTone, StatusTonePresentation>;

type SettaStatusBadgeProps = Omit<ComponentProps<typeof Badge>, "variant"> & {
  tone: SettaStatusTone;
};

export function SettaStatusBadge({ children, className, tone, ...props }: SettaStatusBadgeProps) {
  const presentation = statusTonePresentation[tone];
  const Icon = presentation.icon;
  return (
    <Badge
      {...props}
      className={cn(className, presentation.className)}
      data-tone={tone}
      variant="outline"
    >
      {Icon === null ? null : <Icon aria-hidden data-icon="inline-start" />}
      {presentation.label === null ? null : <span className="sr-only">{presentation.label}: </span>}
      {children}
    </Badge>
  );
}
