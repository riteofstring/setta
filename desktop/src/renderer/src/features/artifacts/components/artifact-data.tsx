import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@renderer/components/ui/alert";

import type { ArtifactComponentProps } from "../generated/artifact-catalog-props";

type MetricTone = NonNullable<ArtifactComponentProps["Metric"]["tone"]>;
type AlertTone = NonNullable<ArtifactComponentProps["Alert"]["tone"]>;

const metricTonePresentation = {
  neutral: { icon: null, label: null },
  positive: { icon: CircleCheckIcon, label: "Positive" },
  negative: { icon: CircleAlertIcon, label: "Negative" },
} satisfies Record<MetricTone, { icon: LucideIcon | null; label: string | null }>;

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
  const presentation = metricTonePresentation[tone];
  const Icon = presentation.icon;
  return (
    <dl className="flex flex-col gap-0.5" data-tone={tone}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0 flex items-center gap-1.5 text-2xl leading-tight font-semibold text-foreground tabular-nums">
        {Icon === null ? null : <Icon aria-hidden className="size-4 shrink-0" />}
        {presentation.label === null ? null : (
          <span className="sr-only">{presentation.label}: </span>
        )}
        {value}
      </dd>
      {caption === undefined ? null : (
        <dd className="m-0 text-xs text-muted-foreground">{caption}</dd>
      )}
    </dl>
  );
}

/**
 * The tone treatment for the official Alert.
 *
 * shadcn ships emphasis variants — default and destructive — not the four
 * severities the catalog exposes. Artifact text stays on the validated card
 * colour pair; Setta status tokens mark the border, while distinct icons and
 * screen-reader copy carry severity without relying on colour. The icon is
 * chosen here rather than named by the model: the catalog deliberately has no
 * icon property.
 */
const alertTones = {
  info: {
    icon: InfoIcon,
    className: "border-status-info/40",
    label: "Information",
  },
  success: {
    icon: CircleCheckIcon,
    className: "border-status-success/40",
    label: "Success",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-status-warning/40",
    label: "Warning",
  },
  danger: {
    icon: CircleAlertIcon,
    className: "border-status-critical/40",
    label: "Danger",
  },
} satisfies Record<AlertTone, { icon: LucideIcon; className: string; label: string }>;

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
    <Alert className={treatment.className} data-tone={tone} variant="default">
      <Icon aria-hidden />
      <AlertTitle>
        <span className="sr-only">{treatment.label}: </span>
        {title}
      </AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}
