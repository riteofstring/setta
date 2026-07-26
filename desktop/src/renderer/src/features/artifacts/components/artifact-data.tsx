import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import type React from "react";

import { Alert, AlertDescription, AlertTitle } from "@renderer/components/ui/alert";
import { cn } from "@renderer/lib/utils";

import type { ArtifactComponentProps } from "../generated/artifact-catalog-props";

type MetricTone = NonNullable<ArtifactComponentProps["Metric"]["tone"]>;
type AlertTone = NonNullable<ArtifactComponentProps["Alert"]["tone"]>;

/*
 * Tone on a metric is the number's colour, not an icon beside it.
 *
 * A glyph wedged between the label and the figure breaks the one thing a stat
 * band is for — a column of numbers the eye can run down — and it was carrying
 * no information the screen-reader label below does not already carry. The
 * colours are the graph's modes, so a failing number and a failing node agree.
 */
const metricTonePresentation = {
  neutral: { className: "text-foreground", label: null },
  positive: { className: "text-[var(--graph-mode-success)]", label: "Positive" },
  negative: { className: "text-[var(--graph-mode-fail)]", label: "Negative" },
} satisfies Record<MetricTone, { className: string; label: string | null }>;

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
  return (
    <dl className="flex flex-col" data-tone={tone}>
      <dt className="setta-artifact-kicker">{label}</dt>
      <dd
        className={cn(
          "m-0 mt-[6px] text-[30px] leading-[1.1] font-semibold tracking-[-0.02em] tabular-nums",
          presentation.className,
        )}
      >
        {presentation.label === null ? null : (
          <span className="sr-only">{presentation.label}: </span>
        )}
        {value}
      </dd>
      {caption === undefined ? null : (
        <dd className="setta-artifact-faint m-0 mt-[5px] text-[12px] leading-[1.4]">{caption}</dd>
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
  info: { icon: InfoIcon, mode: "think", label: "Information" },
  success: { icon: CircleCheckIcon, mode: "success", label: "Success" },
  warning: { icon: TriangleAlertIcon, mode: "risk", label: "Warning" },
  danger: { icon: CircleAlertIcon, mode: "fail", label: "Danger" },
} satisfies Record<AlertTone, { icon: LucideIcon; mode: string; label: string }>;

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
  const accent = `var(--graph-mode-${treatment.mode})`;
  /*
   * The tint falls away rather than filling the block. A flat wash across the
   * document's full width is a slab whatever its opacity, and a slab is the
   * thing a callout was supposed to stop being; a gradient that reaches
   * transparent well before the right edge reads as a mark on the leading edge
   * with the text still sitting on the page's own ground.
   */
  return (
    <Alert
      className="setta-artifact-alert setta-artifact-figure rounded-none border-0 border-s-2 px-4 py-3"
      data-tone={tone}
      style={{ "--setta-artifact-accent": accent } as React.CSSProperties}
      variant="default"
    >
      <Icon aria-hidden className="text-[var(--setta-artifact-accent)]" />
      <AlertTitle className="text-[13px] leading-[1.35] font-semibold">
        <span className="sr-only">{treatment.label}: </span>
        {title}
      </AlertTitle>
      <AlertDescription className="text-[14px] leading-[1.5] text-muted-foreground">
        {body}
      </AlertDescription>
    </Alert>
  );
}
