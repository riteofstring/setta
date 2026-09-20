import { useWorkspaceAppearance } from "@setta/workspace";
import { useMemo } from "react";

import type { HistogramBin } from "../app/aggregation";
import { useLens } from "../app/lensContext";
import { fieldExtent, formatScalar } from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";
import { AnnotatedChartSurface } from "../charts/AnnotatedChartSurface";
import { chartPalette, histogramOption } from "../charts/chartOptions";

function histogramBins(
  values: readonly number[],
  count: number,
): HistogramBin[] {
  if (values.length === 0) {
    return [];
  }
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const width = maximum === minimum ? 1 : (maximum - minimum) / count;
  const bins = Array.from(
    { length: maximum === minimum ? 1 : count },
    (_, index) => ({
      count: 0,
      maximum: index === count - 1 ? maximum : minimum + width * (index + 1),
      minimum: minimum + width * index,
    }),
  );
  for (const value of values) {
    const index =
      maximum === minimum
        ? 0
        : Math.min(count - 1, Math.floor((value - minimum) / width));
    const bin = bins[index];
    if (bin) {
      bins[index] = { ...bin, count: bin.count + 1 };
    }
  }
  return bins;
}

export function HistogramSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const definition = presentationSection(lens.snapshot, sectionId, "histogram");
  const field = presentationFields(lens.snapshot, [definition.fieldId])[0];
  if (!field) {
    throw new Error(`Histogram section ${sectionId} has no field.`);
  }
  const values = lens.visible
    .map((observation) => observation.values[field.id])
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  const bins = histogramBins(values, definition.bins);
  const option = useMemo(
    () =>
      histogramOption({
        bins,
        field,
        palette: chartPalette(darkMode),
      }),
    [bins, darkMode, field],
  );
  const extent = fieldExtent(lens.snapshot.observations, field.id);
  const events = useMemo(
    () => ({
      click: (event: unknown) => {
        if (!extent || typeof event !== "object" || event === null) {
          return;
        }
        const index =
          "dataIndex" in event && typeof event.dataIndex === "number"
            ? event.dataIndex
            : -1;
        const bin = bins[index];
        if (bin) {
          lens.actions.setRangeFilter(
            field.id,
            bin.minimum,
            bin.maximum,
            extent,
          );
        }
      },
    }),
    [bins, extent, field.id, lens.actions],
  );
  return (
    <div className="lens-chart-section" data-lens-section="histogram">
      <div className="lens-chart-toolbar">
        <span>{field.label}</span>
        <span className="lens-chart-count">
          {formatScalar(values.length)} values · click a bar to filter
        </span>
      </div>
      <AnnotatedChartSurface
        ariaLabel={`Distribution of ${field.label}`}
        chartFieldIds={[field.id]}
        events={events}
        option={option}
        sectionId={sectionId}
      />
    </div>
  );
}
