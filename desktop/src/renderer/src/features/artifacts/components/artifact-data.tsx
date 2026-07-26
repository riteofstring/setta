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
      <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="m-0 flex items-center gap-1.5 text-[20px] leading-tight font-semibold text-foreground tabular-nums">
        {Icon === null ? null : <Icon aria-hidden className="size-4 shrink-0" />}
        {presentation.label === null ? null : (
          <span className="sr-only">{presentation.label}: </span>
        )}
        {value}
      </dd>
      {caption === undefined ? null : (
        <dd className="m-0 text-[11px] text-muted-foreground">{caption}</dd>
      )}
    </dl>
  );
}

/**
 * The tone treatment for the official Alert.
 *
 * shadcn ships emphasis variants — default and destructive — not the four
 * severities the catalog exposes, so severity is carried here. Distinct icons
 * and screen-reader copy do that without relying on colour; the icon is chosen
 * here rather than named by the model, because the catalog deliberately has no
 * icon property.
 *
 * A callout is a rule and a tint, not a panel. A full border around every
 * severity turned a document into a stack of framed boxes, and the frame is the
 * least informative thing about a callout — the mark on its leading edge says
 * the same thing at a fraction of the weight.
 *
 * The colours are the graph's mode colours, so a failing artifact and a failing
 * node are the same red.
 */
const alertTones = {
  info: {
    icon: InfoIcon,
    className: "border-s-[var(--graph-mode-think)] bg-[var(--graph-mode-think)]/6",
    label: "Information",
  },
  success: {
    icon: CircleCheckIcon,
    className: "border-s-[var(--graph-mode-success)] bg-[var(--graph-mode-success)]/6",
    label: "Success",
  },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-s-[var(--graph-mode-risk)] bg-[var(--graph-mode-risk)]/6",
    label: "Warning",
  },
  danger: {
    icon: CircleAlertIcon,
    className: "border-s-[var(--graph-mode-fail)] bg-[var(--graph-mode-fail)]/6",
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
    <Alert
      className={`rounded-none border-0 border-s-2 px-3 py-2 ${treatment.className}`}
      data-tone={tone}
      variant="default"
    >
      <Icon aria-hidden />
      <AlertTitle>
        <span className="sr-only">{treatment.label}: </span>
        {title}
      </AlertTitle>
      <AlertDescription>{body}</AlertDescription>
    </Alert>
  );
}
