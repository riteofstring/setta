import { useWorkspaceAppearance } from "@setta/workspace";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useLens } from "../app/lensContext";
import {
  activeRangeFor,
  formatScalar,
  nearestSeriesSampleX,
  numericMetricFields,
  seriesArtifactForObservation,
} from "../app/lensModel";
import {
  EChartSurface,
  type EChartPointerHandler,
} from "../charts/EChartSurface";
import { chartPalette, seriesOption } from "../charts/chartOptions";

export function SeriesSection() {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const artifact = seriesArtifactForObservation(
    lens.snapshot,
    lens.focused?.id ?? null,
  );
  const document =
    artifact?.status === "resolved" && artifact.content.kind === "series"
      ? artifact.content.series
      : null;
  const reference = document ? (artifact?.reference ?? null) : null;
  const activeRange = reference
    ? activeRangeFor(lens.selection, reference.id)
    : null;
  const range = activeRange
    ? { end: activeRange.end, start: activeRange.start }
    : null;
  const cursor =
    lens.timeline.artifactId === reference?.id ? lens.timeline.cursor : null;
  const focusedAxisValue = document
    ? lens.focused?.values[document.axis.id]
    : null;
  const initialCursor = document
    ? nearestSeriesSampleX(
        document.samples,
        typeof focusedAxisValue === "number"
          ? focusedAxisValue
          : (document.samples[0]?.x ?? Number.NaN),
      )
    : null;
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
  }, [initialCursor, lens.actions, lens.focused?.id, reference?.id]);
  const option = useMemo(
    () =>
      document
        ? seriesOption({
            cursor,
            document,
            palette: chartPalette(darkMode),
            range,
          })
        : {},
    [cursor, darkMode, document, range],
  );
  const events = useMemo(
    () => ({
      datazoom: (event: unknown) => {
        if (!reference || !document || document.samples.length === 0) {
          return;
        }
        const source =
          typeof event === "object" &&
          event !== null &&
          "batch" in event &&
          Array.isArray(event.batch)
            ? event.batch[0]
            : event;
        if (typeof source !== "object" || source === null) {
          return;
        }
        const zoom = source as { end?: unknown; start?: unknown };
        if (typeof zoom.start !== "number" || typeof zoom.end !== "number") {
          return;
        }
        const first = document.samples[0]?.x ?? 0;
        const last = document.samples.at(-1)?.x ?? first;
        lens.actions.setRange({
          artifactId: reference.id,
          artifactSha256: reference.sha256,
          axisId: document.axis.id,
          end: first + ((last - first) * zoom.end) / 100,
          id: `range.${reference.id}`,
          start: first + ((last - first) * zoom.start) / 100,
        });
      },
    }),
    [document, lens.actions, reference],
  );
  const handlePointer = useCallback<EChartPointerHandler>(
    (event, chart) => {
      if (!reference || !document || document.samples.length === 0) {
        return;
      }
      const x = event.offsetX ?? event.zrX;
      const y = event.offsetY ?? event.zrY;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        x < 0 ||
        y < 0 ||
        x > chart.getWidth() ||
        y > chart.getHeight()
      ) {
        return;
      }
      const converted = chart.convertFromPixel({ xAxisIndex: 0 }, [x, y]);
      const convertedValue = Array.isArray(converted)
        ? converted[0]
        : converted;
      const first = document.samples[0]?.x ?? 0;
      const last = document.samples.at(-1)?.x ?? first;
      const rawValue =
        typeof convertedValue === "number" && Number.isFinite(convertedValue)
          ? convertedValue
          : first + (last - first) * (x / Math.max(1, chart.getWidth()));
      const nearest = nearestSeriesSampleX(document.samples, rawValue);
      lens.actions.setTimelineCursor(reference.id, nearest);
    },
    [document, lens.actions, reference],
  );
  const metrics = numericMetricFields(lens.snapshot).slice(0, 4);
  if (!lens.focused) {
    return (
      <p className="lens-empty">Select an observation to inspect its trace.</p>
    );
  }
  if (artifact?.status === "failed") {
    return (
      <div className="lens-artifact-failure" role="alert">
        <strong>Recorded series unavailable</strong>
        <span>{artifact.error.message}</span>
      </div>
    );
  }
  if (!reference || !document) {
    return (
      <div className="lens-empty-state">
        <strong>{lens.focused.id}</strong>
        <span>No admitted series is attached to this observation.</span>
      </div>
    );
  }
  return (
    <div
      className="lens-series"
      data-lens-section="series"
      data-lens-timeline-cursor={cursor ?? ""}
    >
      <div className="lens-detail-strip">
        <div className="lens-focus-identity">
          <strong data-lens-focused-id>{lens.focused.id}</strong>
        </div>
        {metrics.map((field) => (
          <div className="lens-detail-metric" key={field.id}>
            <span>{field.label}</span>
            <strong>
              {formatScalar(lens.focused?.values[field.id], field)}
            </strong>
          </div>
        ))}
      </div>
      <EChartSurface
        ariaLabel={`Recorded series for ${lens.focused.id}`}
        events={events}
        onPointer={handlePointer}
        option={option}
      />
      <div className="lens-timeline-status">
        <span>
          {cursor === null
            ? document.axis.label
            : `${document.axis.label} ${formatScalar(cursor)}${document.axis.unit ? ` ${document.axis.unit}` : ""}`}
        </span>
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
