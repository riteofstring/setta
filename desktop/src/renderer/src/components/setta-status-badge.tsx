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
    className: "border-status-critical/40 bg-card text-card-foreground",
    icon: CircleAlertIcon,
    label: "Danger",
  },
  info: {
    className: "border-status-info/40 bg-card text-card-foreground",
    icon: InfoIcon,
    label: "Information",
  },
  neutral: {
    className: "border-border bg-card text-card-foreground",
    icon: null,
    label: null,
  },
  success: {
    className: "border-status-success/40 bg-card text-card-foreground",
    icon: CircleCheckIcon,
    label: "Success",
  },
  warning: {
    className: "border-status-warning/40 bg-card text-card-foreground",
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
