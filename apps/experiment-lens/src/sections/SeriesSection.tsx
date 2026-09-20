import { useWorkspaceAppearance } from "@setta/workspace";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type {
  ArtifactRange,
  ArtifactReference,
  FieldDefinition,
  Observation,
  ResolvedArtifact,
  SeriesDocument,
} from "../backend/generatedContract";
import { useLens, type LensContextValue } from "../app/lensContext";
import {
  activeRangeFor,
  formatScalar,
  nearestSeriesSampleX,
  seriesArtifactForObservation,
} from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";
import {
  EChartSurface,
  type EChartPointerHandler,
} from "../charts/EChartSurface";
import { chartPalette, seriesOption } from "../charts/chartOptions";

type ChartPointerEvent = Parameters<EChartPointerHandler>[0];
type LensChart = Parameters<EChartPointerHandler>[1];

function pointerPosition(
  event: ChartPointerEvent,
  chart: LensChart,
): { x: number; y: number } | null {
  const x = event.offsetX ?? event.zrX;
  const y = event.offsetY ?? event.zrY;
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  if (x < 0 || y < 0 || x > chart.getWidth() || y > chart.getHeight()) {
    return null;
  }
  return { x, y };
}

function cursorAtPointer(
  event: ChartPointerEvent,
  chart: LensChart,
  document: SeriesDocument,
): number | null {
  const pointer = pointerPosition(event, chart);
  if (!pointer) {
    return null;
  }
  const converted = chart.convertFromPixel({ xAxisIndex: 0 }, [
    pointer.x,
    pointer.y,
  ]);
  const convertedValue = Array.isArray(converted) ? converted[0] : converted;
  const first = document.samples[0]?.x ?? 0;
  const last = document.samples.at(-1)?.x ?? first;
  const fallback =
    first + (last - first) * (pointer.x / Math.max(1, chart.getWidth()));
  const rawValue =
    typeof convertedValue === "number" && Number.isFinite(convertedValue)
      ? convertedValue
      : fallback;
  return nearestSeriesSampleX(document.samples, rawValue);
}

function zoomValues(event: unknown): { end: number; start: number } | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }
  const root = event as Record<string, unknown>;
  const candidate = Array.isArray(root.batch) ? root.batch[0] : root;
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }
  const zoom = candidate as Record<string, unknown>;
  return typeof zoom.start === "number" && typeof zoom.end === "number"
    ? { end: zoom.end, start: zoom.start }
    : null;
}

function rangeAtZoom(
  event: unknown,
  document: SeriesDocument,
  reference: ArtifactReference,
): ArtifactRange | null {
  const zoom = zoomValues(event);
  if (!zoom) {
    return null;
  }
  const first = document.samples[0]?.x ?? 0;
  const last = document.samples.at(-1)?.x ?? first;
  return {
    artifactId: reference.id,
    artifactSha256: reference.sha256,
    axisId: document.axis.id,
    end: first + ((last - first) * zoom.end) / 100,
    id: `range.${reference.id}`,
    start: first + ((last - first) * zoom.start) / 100,
  };
}

function resolvedSeries(artifact: ResolvedArtifact | null): {
  document: SeriesDocument;
  reference: ArtifactReference;
} | null {
  if (artifact?.status !== "resolved" || artifact.content.kind !== "series") {
    return null;
  }
  return {
    document: artifact.content.series,
    reference: artifact.reference,
  };
}

function initialCursorFor(
  resolved: ReturnType<typeof resolvedSeries>,
  focused: Observation | null,
): number | null {
  if (!resolved) {
    return null;
  }
  const focusedAxisValue = focused?.values[resolved.document.axis.id];
  const target =
    typeof focusedAxisValue === "number"
      ? focusedAxisValue
      : (resolved.document.samples[0]?.x ?? Number.NaN);
  return nearestSeriesSampleX(resolved.document.samples, target);
}

function observationID(observation: Observation | null): string | null {
  return observation ? observation.id : null;
}

function timelineState(
  resolved: ReturnType<typeof resolvedSeries>,
  lens: LensContextValue,
) {
  const reference = resolved?.reference ?? null;
  const document = resolved?.document ?? null;
  return {
    activeRange: reference
      ? activeRangeFor(lens.selection, reference.id)
      : null,
    cursor:
      lens.timeline.artifactId === reference?.id ? lens.timeline.cursor : null,
    document,
    reference,
  };
}

function useTimelineModel(sectionId: string) {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const definition = presentationSection(lens.snapshot, sectionId, "timeline");
  const artifact = seriesArtifactForObservation(
    lens.snapshot,
    observationID(lens.focused),
    definition.artifactRole,
  );
  const resolved = resolvedSeries(artifact);
  const { activeRange, cursor, document, reference } = timelineState(
    resolved,
    lens,
  );
  const initialCursor = initialCursorFor(resolved, lens.focused);
  const initializedFocus = useRef("");
  useEffect(() => {
    if (!reference || initialCursor === null) {
      return;
    }
    const key = `${lens.focused?.id ?? ""}\u0000${reference.id}`;
    if (initializedFocus.current === key) {
      return;
    }
    initializedFocus.current = key;
    lens.actions.setTimelineCursor(reference.id, initialCursor);
  }, [initialCursor, lens.actions, lens.focused?.id, reference]);
  const option = useMemo(
    () =>
      document
        ? seriesOption({
            cursor,
            document,
            palette: chartPalette(darkMode),
            range: activeRange
              ? { end: activeRange.end, start: activeRange.start }
              : null,
          })
        : {},
    [activeRange, cursor, darkMode, document],
  );
  const events = useMemo(
    () => ({
      datazoom: (event: unknown) => {
        if (!reference || !document || document.samples.length === 0) {
          return;
        }
        const range = rangeAtZoom(event, document, reference);
        if (range) {
          lens.actions.setRange(range);
        }
      },
    }),
    [document, lens.actions, reference],
  );
  const handlePointer = useCallback<EChartPointerHandler>(
    (event, chart) => {
      if (!reference || !document || document.samples.length === 0) {
        return;
      }
      lens.actions.setTimelineCursor(
        reference.id,
        cursorAtPointer(event, chart, document),
      );
    },
    [document, lens.actions, reference],
  );
  return {
    activeRange,
    artifact,
    cursor,
    details: presentationFields(lens.snapshot, definition.detailFieldIds),
    document,
    events,
    focused: lens.focused,
    handlePointer,
    option,
    reference,
  };
}

function ResolvedTimeline({
  activeRange,
  cursor,
  details,
  document,
  events,
  focused,
  handlePointer,
  option,
}: {
  activeRange: ArtifactRange | null;
  cursor: number | null;
  details: readonly FieldDefinition[];
  document: SeriesDocument;
  events: Record<string, (event: unknown) => void>;
  focused: Observation;
  handlePointer: EChartPointerHandler;
  option: ReturnType<typeof seriesOption>;
}) {
  const cursorLabel =
    cursor === null
      ? document.axis.label
      : `${document.axis.label} ${formatScalar(cursor)}${document.axis.unit ? ` ${document.axis.unit}` : ""}`;
  return (
    <div
      className="lens-series"
      data-lens-section="timeline"
      data-lens-timeline-cursor={cursor ?? ""}
    >
      <div className="lens-detail-strip">
        <div className="lens-focus-identity">
          <strong data-lens-focused-id>{focused.id}</strong>
        </div>
        {details.map((field) => (
          <div className="lens-detail-metric" key={field.id}>
            <span>{field.label}</span>
            <strong>{formatScalar(focused.values[field.id], field)}</strong>
          </div>
        ))}
      </div>
      <EChartSurface
        ariaLabel={`Recorded series for ${focused.id}`}
        events={events}
        onPointer={handlePointer}
        option={option}
      />
      <div className="lens-timeline-status">
        <span>{cursorLabel}</span>
        {activeRange ? (
          <span data-lens-active-range>
            range {formatScalar(activeRange.start)}–
            {formatScalar(activeRange.end)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TimelineResult(model: ReturnType<typeof useTimelineModel>) {
  if (!model.focused) {
    return (
      <p className="lens-empty">Select an observation to inspect its trace.</p>
    );
  }
  if (model.artifact?.status === "failed") {
    return (
      <div className="lens-artifact-failure" role="alert">
        <strong>Recorded series unavailable</strong>
        <span>{model.artifact.error.message}</span>
      </div>
    );
  }
  if (!model.reference || !model.document) {
    return (
      <div className="lens-empty-state">
        <strong>{model.focused.id}</strong>
        <span>No admitted series is attached to this observation.</span>
      </div>
    );
  }
  return (
    <ResolvedTimeline
      activeRange={model.activeRange}
      cursor={model.cursor}
      details={model.details}
      document={model.document}
      events={model.events}
      focused={model.focused}
      handlePointer={model.handlePointer}
      option={model.option}
    />
  );
}

export function TimelineSection({ sectionId }: { sectionId: string }) {
  const model = useTimelineModel(sectionId);
  return <TimelineResult {...model} />;
}
