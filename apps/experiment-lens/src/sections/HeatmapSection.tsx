import { useWorkspaceAppearance } from "@setta/workspace";
import { useCallback, useMemo, type CSSProperties } from "react";

import { aggregateValues } from "../app/aggregation";
import { useLens } from "../app/lensContext";
import { fieldChoices } from "../app/lensModel";
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
import { chartPalette, heatmapOption } from "../charts/chartOptions";
import type { LensChart } from "../charts/EChartSurface";

type HeatmapCell = Readonly<{
  observationIds: readonly string[];
  value: number | null;
  xIndex: number;
  yIndex: number;
}>;

function observationsInHeatmapGesture(
  cells: readonly HeatmapCell[],
  xCount: number,
  yCount: number,
  gesture: ChartSelectionGesture,
  chart: LensChart,
): string[] {
  const selection = chartGesturePixelBounds(gesture, chart);
  const xCenters = Array.from(
    { length: xCount },
    (_, index) => chartDataPixel(chart, [index, 0])?.[0] ?? Number.NaN,
  );
  const yCenters = Array.from(
    { length: yCount },
    (_, index) => chartDataPixel(chart, [0, index])?.[1] ?? Number.NaN,
  );
  return cells.flatMap((cell) => {
    const x = xCenters[cell.xIndex];
    const y = yCenters[cell.yIndex];
    if (
      x === undefined ||
      y === undefined ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return [];
    }
    const halfWidth = chartBandHalfSize(
      xCenters,
      cell.xIndex,
      chart.getWidth() / 2,
    );
    const halfHeight = chartBandHalfSize(
      yCenters,
      cell.yIndex,
      chart.getHeight() / 2,
    );
    return pixelRectanglesIntersect(selection, {
      bottom: y + halfHeight,
      left: x - halfWidth,
      right: x + halfWidth,
      top: y - halfHeight,
    })
      ? [...cell.observationIds]
      : [];
  });
}

export function HeatmapSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const definition = presentationSection(lens.snapshot, sectionId, "heatmap");
  const [xField, yField, valueField] = presentationFields(lens.snapshot, [
    definition.xFieldId,
    definition.yFieldId,
    definition.valueFieldId,
  ]);
  if (!xField || !yField || !valueField) {
    throw new Error(`Heatmap section ${sectionId} has invalid field bindings.`);
  }
  const xChoices = fieldChoices(lens.visible, xField.id).map(
    (choice) => choice.value,
  );
  const yChoices = fieldChoices(lens.visible, yField.id).map(
    (choice) => choice.value,
  );
  const cells = xChoices.flatMap((xValue, xIndex) =>
    yChoices.map((yValue, yIndex) => {
      const observations = lens.visible.filter(
        (observation) =>
          Object.is(observation.values[xField.id] ?? null, xValue) &&
          Object.is(observation.values[yField.id] ?? null, yValue),
      );
      const values = observations
        .map((observation) => observation.values[valueField.id])
        .filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value),
        );
      return {
        observationIds: observations.map((observation) => observation.id),
        value: aggregateValues(values, definition.aggregation),
        xIndex,
        yIndex,
      };
    }),
  );
  const option = useMemo(
    () =>
      heatmapOption({
        aggregation: definition.aggregation,
        cells,
        palette: chartPalette(darkMode),
        selection: lens.selection,
        valueField,
        xChoices,
        xField,
        yChoices,
        yField,
      }),
    [
      cells,
      darkMode,
      definition.aggregation,
      lens.selection,
      valueField,
      xChoices,
      xField,
      yChoices,
      yField,
    ],
  );
  const selectionResolver = useCallback(
    (gesture: ChartSelectionGesture, chart: LensChart) =>
      observationsInHeatmapGesture(
        cells,
        xChoices.length,
        yChoices.length,
        gesture,
        chart,
      ),
    [cells, xChoices.length, yChoices.length],
  );
  const allXChoices = fieldChoices(lens.snapshot.observations, xField.id).map(
    (choice) => choice.value,
  );
  const allYChoices = fieldChoices(lens.snapshot.observations, yField.id).map(
    (choice) => choice.value,
  );
  const events = useMemo(
    () => ({
      click: (event: unknown) => {
        if (
          typeof event !== "object" ||
          event === null ||
          !("value" in event)
        ) {
          return;
        }
        const value = event.value;
        if (!Array.isArray(value)) {
          return;
        }
        const xValue = xChoices[Number(value[0])];
        const yValue = yChoices[Number(value[1])];
        if (xValue !== undefined && yValue !== undefined) {
          lens.actions.setCategoricalFilter(xField.id, [xValue], allXChoices);
          lens.actions.setCategoricalFilter(yField.id, [yValue], allYChoices);
        }
      },
    }),
    [
      allXChoices,
      allYChoices,
      lens.actions,
      xChoices,
      xField.id,
      yChoices,
      yField.id,
    ],
  );
  const stageStyle = {
    maxHeight: `${String(Math.max(300, yChoices.length * 88 + 120))}px`,
    maxWidth: `${String(Math.max(560, xChoices.length * 155 + 170))}px`,
  } satisfies CSSProperties;
  return (
    <div className="lens-chart-section" data-lens-section="heatmap">
      <div className="lens-chart-toolbar">
        <span>{`${definition.aggregation} ${valueField.label}`}</span>
        <span className="lens-chart-count">click a cell to filter</span>
      </div>
      <div className="lens-heatmap-stage" style={stageStyle}>
        <AnnotatedChartSurface
          ariaLabel={`${valueField.label} by ${xField.label} and ${yField.label}`}
          chartFieldIds={[xField.id, yField.id, valueField.id]}
          events={events}
          option={option}
          sectionId={sectionId}
          selectionLabel="Select cells"
          selectionResolver={selectionResolver}
        />
      </div>
    </div>
  );
}
