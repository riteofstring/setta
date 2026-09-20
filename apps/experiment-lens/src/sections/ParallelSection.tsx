import { useWorkspaceAppearance } from "@setta/workspace";
import { useMemo } from "react";

import type {
  FieldDefinition,
  Observation,
} from "../backend/generatedContract";
import { useLens } from "../app/lensContext";
import { fieldExtent } from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";
import { AnnotatedChartSurface } from "../charts/AnnotatedChartSurface";
import { chartPalette, parallelOption } from "../charts/chartOptions";

function axisCandidate(event: unknown): {
  intervals: unknown;
  parallelAxisId: string;
} | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }
  const candidate = event as {
    intervals?: unknown;
    parallelAxisId?: unknown;
  };
  return typeof candidate.parallelAxisId === "string"
    ? {
        intervals: candidate.intervals,
        parallelAxisId: candidate.parallelAxisId,
      }
    : null;
}

function numericInterval(intervals: unknown): {
  maximum: number | null;
  minimum: number | null;
} {
  const interval = Array.isArray(intervals) ? intervals[0] : null;
  const minimum = Array.isArray(interval) ? interval[0] : null;
  const maximum = Array.isArray(interval) ? interval[1] : null;
  return {
    maximum: typeof maximum === "number" ? maximum : null,
    minimum: typeof minimum === "number" ? minimum : null,
  };
}

function axisSelection(
  event: unknown,
  fields: readonly FieldDefinition[],
  observations: readonly Observation[],
) {
  const candidate = axisCandidate(event);
  if (!candidate) {
    return null;
  }
  const field = fields.find((item) => item.id === candidate.parallelAxisId);
  const extent = field ? fieldExtent(observations, field.id) : null;
  if (!field || !extent) {
    return null;
  }
  const interval = numericInterval(candidate.intervals);
  return {
    extent,
    fieldId: field.id,
    ...interval,
  };
}

export function ParallelSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const definition = presentationSection(lens.snapshot, sectionId, "parallel");
  const fields = presentationFields(lens.snapshot, definition.fieldIds);
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
        const selection = axisSelection(
          event,
          fields,
          lens.snapshot.observations,
        );
        if (!selection) {
          return;
        }
        lens.actions.setRangeFilter(
          selection.fieldId,
          selection.minimum,
          selection.maximum,
          selection.extent,
        );
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
      <AnnotatedChartSurface
        ariaLabel="Parallel coordinates for the visible experiment cohort"
        chartFieldIds={fields.map((field) => field.id)}
        events={events}
        option={option}
        sectionId={sectionId}
      />
    </div>
  );
}
