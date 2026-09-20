import { useWorkspaceAppearance } from "@setta/workspace";
import { useMemo, type CSSProperties } from "react";

import { aggregateValues } from "../app/aggregation";
import { useLens } from "../app/lensContext";
import { fieldChoices } from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";
import { AnnotatedChartSurface } from "../charts/AnnotatedChartSurface";
import { chartPalette, heatmapOption } from "../charts/chartOptions";

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
      const values = lens.visible
        .filter(
          (observation) =>
            Object.is(observation.values[xField.id] ?? null, xValue) &&
            Object.is(observation.values[yField.id] ?? null, yValue),
        )
        .map((observation) => observation.values[valueField.id])
        .filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value),
        );
      return {
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
      valueField,
      xChoices,
      xField,
      yChoices,
      yField,
    ],
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
        />
      </div>
    </div>
  );
}
