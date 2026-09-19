import { useWorkspaceAppearance } from "@setta/workspace";
import { useCallback, useMemo, useState } from "react";

import { useLens } from "../app/lensContext";
import {
  categoricalFactorFields,
  fieldExtent,
  numericFactorFields,
  numericMetricFields,
} from "../app/lensModel";
import {
  EChartSurface,
  type EChartPointerHandler,
} from "../charts/EChartSurface";
import { chartPalette, scatterOption } from "../charts/chartOptions";

export function ScatterSection() {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const xFields = numericFactorFields(lens.snapshot);
  const yFields = numericMetricFields(lens.snapshot);
  const defaultX = useMemo(
    () =>
      [...xFields].sort((left, right) => {
        const leftExtent = fieldExtent(lens.snapshot.observations, left.id);
        const rightExtent = fieldExtent(lens.snapshot.observations, right.id);
        return (
          (rightExtent?.maximum ?? 0) -
          (rightExtent?.minimum ?? 0) -
          ((leftExtent?.maximum ?? 0) - (leftExtent?.minimum ?? 0))
        );
      })[0],
    [lens.snapshot.observations, xFields],
  );
  const [xId, setXId] = useState(() => defaultX?.id ?? xFields[0]?.id ?? "");
  const [yId, setYId] = useState(() => yFields[0]?.id ?? "");
  const xField = xFields.find((field) => field.id === xId) ?? xFields[0];
  const yField = yFields.find((field) => field.id === yId) ?? yFields[0];
  const category = categoricalFactorFields(lens.snapshot)[0] ?? null;
  const option = useMemo(
    () =>
      xField && yField
        ? scatterOption({
            category,
            observations: lens.visible,
            palette: chartPalette(darkMode),
            selection: lens.selection,
            xField,
            yField,
          })
        : {},
    [category, darkMode, lens.selection, lens.visible, xField, yField],
  );
  const events = useMemo(
    () => ({
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
    [lens.actions],
  );
  const handlePointer = useCallback<EChartPointerHandler>(
    (event, chart) => {
      if (!xField || !yField || lens.visible.length === 0) {
        return;
      }
      const pointerX = event.offsetX ?? event.zrX;
      const pointerY = event.offsetY ?? event.zrY;
      if (typeof pointerX !== "number" || typeof pointerY !== "number") {
        return;
      }
      const coordinate = chart.convertFromPixel(
        { xAxisIndex: 0, yAxisIndex: 0 },
        [pointerX, pointerY],
      );
      if (
        !Array.isArray(coordinate) ||
        typeof coordinate[0] !== "number" ||
        typeof coordinate[1] !== "number"
      ) {
        return;
      }
      const xExtent = fieldExtent(lens.visible, xField.id);
      const yExtent = fieldExtent(lens.visible, yField.id);
      if (!xExtent || !yExtent) {
        return;
      }
      const xSpan = Math.max(Number.EPSILON, xExtent.maximum - xExtent.minimum);
      const ySpan = Math.max(Number.EPSILON, yExtent.maximum - yExtent.minimum);
      const nearest = lens.visible.reduce<{
        distance: number;
        id: string;
      } | null>((current, observation) => {
        const x = observation.values[xField.id];
        const y = observation.values[yField.id];
        if (typeof x !== "number" || typeof y !== "number") {
          return current;
        }
        const distance = Math.hypot(
          (x - coordinate[0]) / xSpan,
          (y - coordinate[1]) / ySpan,
        );
        return current === null || distance < current.distance
          ? { distance, id: observation.id }
          : current;
      }, null);
      if (nearest && nearest.distance < 0.12) {
        lens.actions.focusObservation(nearest.id);
      }
    },
    [lens.actions, lens.visible, xField, yField],
  );
  if (!xField || !yField) {
    return (
      <p className="lens-empty">
        This experiment has no numeric population view.
      </p>
    );
  }
  return (
    <div className="lens-chart-section" data-lens-section="scatter">
      <div className="lens-chart-toolbar">
        <label>
          <span>X</span>
          <select
            onChange={(event) => setXId(event.target.value)}
            value={xField.id}
          >
            {xFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Y</span>
          <select
            onChange={(event) => setYId(event.target.value)}
            value={yField.id}
          >
            {yFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
        <span className="lens-chart-count">{lens.visible.length} visible</span>
      </div>
      <EChartSurface
        ariaLabel={`${yField.label} by ${xField.label}`}
        events={events}
        onPointer={handlePointer}
        option={option}
      />
    </div>
  );
}
