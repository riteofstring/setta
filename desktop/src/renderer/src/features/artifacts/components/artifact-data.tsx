import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { ComponentType } from "react";

import { Alert, AlertDescription, AlertTitle } from "@renderer/components/ui/alert";
import { cn } from "@renderer/lib/utils";

import type { ArtifactComponentProps } from "../generated/artifact-catalog-props";

type MetricTone = NonNullable<ArtifactComponentProps["Metric"]["tone"]>;
type AlertTone = NonNullable<ArtifactComponentProps["Alert"]["tone"]>;

const metricToneClasses = {
  neutral: "text-foreground",
  positive: "text-status-success",
  negative: "text-status-critical",
} satisfies Record<MetricTone, string>;

/** One headline number with the label that says what it measures. */
export function ArtifactMetric({
  caption,
  label,
  tone,
  value,
}: {
  caption: string | undefined;
  label: string;
  tone: MetricTone;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn("text-2xl leading-tight font-semibold tabular-nums", metricToneClasses[tone])}
      >
        {value}
      </span>
      {caption === undefined ? null : (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </div>
  );
}

/**
 * The tone treatment for the official Alert.
 *
 * shadcn ships emphasis variants — default and destructive — not the four
 * severities the catalog exposes, so the Setta status tokens supply the rest.
 * The icon is chosen by tone here rather than named by the model: the catalog
 * deliberately has no icon property.
 */
const alertTones = {
  info: {
    destructive: false,
    icon: InfoIcon,
    className:
      "border-status-info/40 text-status-info [&_[data-slot=alert-title]]:text-status-info",
  },
  success: {
    destructive: false,
    icon: CircleCheckIcon,
    className:
      "border-status-success/40 text-status-success [&_[data-slot=alert-title]]:text-status-success",
  },
  warning: {
    destructive: false,
    icon: TriangleAlertIcon,
    className:
      "border-status-warning/40 text-status-warning [&_[data-slot=alert-title]]:text-status-warning",
  },
  danger: { destructive: true, icon: CircleAlertIcon, className: "border-status-critical/40" },
} satisfies Record<
  AlertTone,
  { destructive: boolean; icon: ComponentType<{ className?: string }>; className: string }
>;

/** A callout the reader must not miss. */
export function ArtifactAlert({
  body,
  title,
  tone,
}: {
  body: string;
  title: string;
  tone: AlertTone;
}) {
  const treatment = alertTones[tone];
  const Icon = treatment.icon;
  return (
    <Alert
      className={treatment.className}
      variant={treatment.destructive ? "destructive" : "default"}
    >
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}
