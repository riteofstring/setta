import { useWorkspaceAppearance } from "@setta/workspace";
import { useMemo } from "react";

import { useLens } from "../app/lensContext";
import {
  fieldExtent,
  numericFactorFields,
  numericMetricFields,
} from "../app/lensModel";
import { EChartSurface } from "../charts/EChartSurface";
import { chartPalette, parallelOption } from "../charts/chartOptions";

export function ParallelSection() {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const fields = useMemo(
    () =>
      [
        ...numericFactorFields(lens.snapshot).slice(0, 3),
        ...numericMetricFields(lens.snapshot).slice(0, 4),
      ].slice(0, 6),
    [lens.snapshot],
  );
  const option = useMemo(
    () =>
      parallelOption({
        fields,
        observations: lens.visible,
        palette: chartPalette(darkMode),
        selection: lens.selection,
      }),
    [darkMode, fields, lens.selection, lens.visible],
  );
  const events = useMemo(
    () => ({
      axisareaselected: (event: unknown) => {
        if (typeof event !== "object" || event === null) {
          return;
        }
        const candidate = event as {
          intervals?: unknown;
          parallelAxisId?: unknown;
        };
        if (typeof candidate.parallelAxisId !== "string") {
          return;
        }
        const field = fields.find(
          (item) => item.id === candidate.parallelAxisId,
        );
        const extent = field
          ? fieldExtent(lens.snapshot.observations, field.id)
          : null;
        const intervals = Array.isArray(candidate.intervals)
          ? candidate.intervals
          : [];
        const interval = intervals[0];
        if (!field || !extent) {
          return;
        }
        if (
          Array.isArray(interval) &&
          typeof interval[0] === "number" &&
          typeof interval[1] === "number"
        ) {
          lens.actions.setRangeFilter(
            field.id,
            interval[0],
            interval[1],
            extent,
          );
        } else {
          lens.actions.setRangeFilter(field.id, null, null, extent);
        }
      },
      click: (event: unknown) => {
        const name =
          typeof event === "object" && event !== null && "name" in event
            ? String(event.name)
            : "";
        if (name) {
          lens.actions.focusObservation(name);
        }
      },
    }),
    [fields, lens.actions, lens.snapshot.observations],
  );
  return (
    <div className="lens-chart-section" data-lens-section="parallel">
      <div className="lens-chart-toolbar">
        <span>Brush an axis to narrow the cohort</span>
        <span className="lens-chart-count">{fields.length} dimensions</span>
      </div>
      <EChartSurface
        ariaLabel="Parallel coordinates for the visible experiment cohort"
        events={events}
        option={option}
      />
    </div>
  );
}
