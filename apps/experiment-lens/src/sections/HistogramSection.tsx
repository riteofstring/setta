import { useWorkspaceAppearance } from "@setta/workspace";
import { useCallback, useMemo } from "react";

import type { HistogramBin } from "../app/aggregation";
import { useLens } from "../app/lensContext";
import { fieldExtent, formatScalar } from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";
import { AnnotatedChartSurface } from "../charts/AnnotatedChartSurface";
import {
  chartBandHalfSize,
  chartDataPixel,
  chartGesturePixelBounds,
  pixelRectanglesIntersect,
  type ChartSelectionGesture,
} from "../charts/chartSelection";
import { chartPalette, histogramOption } from "../charts/chartOptions";
import type { LensChart } from "../charts/EChartSurface";
import type { Observation } from "../backend/generatedContract";

function histogramBins(
  observations: readonly Observation[],
  fieldId: string,
  count: number,
): HistogramBin[] {
  const entries = observations.flatMap((observation) => {
    const value = observation.values[fieldId];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ id: observation.id, value }]
      : [];
  });
  if (entries.length === 0) {
    return [];
  }
  const values = entries.map((entry) => entry.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const width = maximum === minimum ? 1 : (maximum - minimum) / count;
  const bins = Array.from(
    { length: maximum === minimum ? 1 : count },
    (_, index) => ({
      count: 0,
      maximum: index === count - 1 ? maximum : minimum + width * (index + 1),
      minimum: minimum + width * index,
      observationIds: [] as string[],
    }),
  );
  for (const entry of entries) {
    const index =
      maximum === minimum
        ? 0
        : Math.min(count - 1, Math.floor((entry.value - minimum) / width));
    const bin = bins[index];
    if (bin) {
      bins[index] = {
        ...bin,
        count: bin.count + 1,
        observationIds: [...bin.observationIds, entry.id],
      };
    }
  }
  return bins;
}

function observationsInHistogramGesture(
  bins: readonly HistogramBin[],
  gesture: ChartSelectionGesture,
  chart: LensChart,
): string[] {
  const selection = chartGesturePixelBounds(gesture, chart);
  const centers = bins.map(
    (_, index) => chartDataPixel(chart, [index, 0])?.[0] ?? Number.NaN,
  );
  return bins.flatMap((bin, index) => {
    const base = chartDataPixel(chart, [index, 0]);
    const top = chartDataPixel(chart, [index, bin.count]);
    const center = centers[index];
    if (!base || !top || center === undefined || !Number.isFinite(center)) {
      return [];
    }
    const halfWidth = chartBandHalfSize(centers, index, 14);
    return pixelRectanglesIntersect(selection, {
      bottom: Math.max(base[1], top[1]),
      left: center - halfWidth,
      right: center + halfWidth,
      top: Math.min(base[1], top[1]),
    })
      ? [...bin.observationIds]
      : [];
  });
}

export function HistogramSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const definition = presentationSection(lens.snapshot, sectionId, "histogram");
  const field = presentationFields(lens.snapshot, [definition.fieldId])[0];
  if (!field) {
    throw new Error(`Histogram section ${sectionId} has no field.`);
  }
  const bins = useMemo(
    () => histogramBins(lens.visible, field.id, definition.bins),
    [definition.bins, field.id, lens.visible],
  );
  const valueCount = bins.reduce((sum, bin) => sum + bin.count, 0);
  const option = useMemo(
    () =>
      histogramOption({
        bins,
        field,
        palette: chartPalette(darkMode),
        selection: lens.selection,
      }),
    [bins, darkMode, field, lens.selection],
  );
  const selectionResolver = useCallback(
    (gesture: ChartSelectionGesture, chart: LensChart) =>
      observationsInHistogramGesture(bins, gesture, chart),
    [bins],
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
          {formatScalar(valueCount)} values · click a bar to filter
        </span>
      </div>
      <AnnotatedChartSurface
        ariaLabel={`Distribution of ${field.label}`}
        chartFieldIds={[field.id]}
        events={events}
        option={option}
        sectionId={sectionId}
        selectionLabel="Select bars"
        selectionResolver={selectionResolver}
      />
    </div>
  );
}
