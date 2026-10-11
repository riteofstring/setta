import { useWorkspaceAppearance } from "@riteofstring/setta";
import { useCallback, useMemo, useState } from "react";

import { useLens } from "../app/lensContext";
import { fieldExtent } from "../app/lensModel";
import {
  presentationFields,
  presentationSection,
} from "../app/presentationSection";
import {
  type LensChart,
  type EChartPointerHandler,
} from "../charts/EChartSurface";
import { AnnotatedChartSurface } from "../charts/AnnotatedChartSurface";
import type { ChartSelectionGesture } from "../charts/chartSelection";
import { chartPalette, scatterOption } from "../charts/chartOptions";

type ChartPointerEvent = Parameters<EChartPointerHandler>[0];

function chartCoordinate(
  event: ChartPointerEvent,
  chart: LensChart,
): [number, number] | null {
  const x = event.offsetX ?? event.zrX;
  const y = event.offsetY ?? event.zrY;
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  const coordinate = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
    x,
    y,
  ]);
  if (!Array.isArray(coordinate)) {
    return null;
  }
  const [coordinateX, coordinateY] = coordinate;
  return typeof coordinateX === "number" && typeof coordinateY === "number"
    ? [coordinateX, coordinateY]
    : null;
}

function nearestObservation(
  lens: ReturnType<typeof useLens>,
  xFieldId: string,
  yFieldId: string,
  coordinate: [number, number],
) {
  const xExtent = fieldExtent(lens.visible, xFieldId);
  const yExtent = fieldExtent(lens.visible, yFieldId);
  if (!xExtent || !yExtent) {
    return null;
  }
  const xSpan = Math.max(Number.EPSILON, xExtent.maximum - xExtent.minimum);
  const ySpan = Math.max(Number.EPSILON, yExtent.maximum - yExtent.minimum);
  let nearest: { distance: number; id: string } | null = null;
  for (const observation of lens.visible) {
    const x = observation.values[xFieldId];
    const y = observation.values[yFieldId];
    if (typeof x !== "number" || typeof y !== "number") {
      continue;
    }
    const distance = Math.hypot(
      (x - coordinate[0]) / xSpan,
      (y - coordinate[1]) / ySpan,
    );
    if (nearest === null || distance < nearest.distance) {
      nearest = { distance, id: observation.id };
    }
  }
  return nearest;
}

function observationsInGesture(
  lens: ReturnType<typeof useLens>,
  xFieldId: string,
  yFieldId: string,
  gesture: ChartSelectionGesture,
  chart: LensChart,
): string[] {
  const width = chart.getWidth();
  const height = chart.getHeight();
  const bounds = {
    bottom: gesture.bounds.bottom * height,
    left: gesture.bounds.left * width,
    right: gesture.bounds.right * width,
    top: gesture.bounds.top * height,
  };
  const click =
    bounds.right - bounds.left < 8 && bounds.bottom - bounds.top < 8;
  const center = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
  const selected = new Set(lens.selection.selectedObservationIds);
  const candidates = lens.visible.flatMap((observation) => {
    const x = observation.values[xFieldId];
    const y = observation.values[yFieldId];
    if (typeof x !== "number" || typeof y !== "number") {
      return [];
    }
    const pixel = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [
      x,
      y,
    ]);
    if (
      !Array.isArray(pixel) ||
      typeof pixel[0] !== "number" ||
      typeof pixel[1] !== "number"
    ) {
      return [];
    }
    return [
      {
        distance: Math.hypot(pixel[0] - center.x, pixel[1] - center.y),
        id: observation.id,
        selected: selected.has(observation.id),
        x: pixel[0],
        y: pixel[1],
      },
    ];
  });
  if (click) {
    const nearby = candidates.filter((candidate) => candidate.distance <= 18);
    const selectable = nearby.some((candidate) => candidate.selected)
      ? nearby.filter((candidate) => candidate.selected)
      : nearby;
    const nearest = selectable.reduce<(typeof candidates)[number] | null>(
      (current, candidate) =>
        current === null || candidate.distance < current.distance
          ? candidate
          : current,
      null,
    );
    return nearest ? [nearest.id] : [];
  }
  return candidates
    .filter(
      (candidate) =>
        candidate.x >= bounds.left &&
        candidate.x <= bounds.right &&
        candidate.y >= bounds.top &&
        candidate.y <= bounds.bottom,
    )
    .map((candidate) => candidate.id);
}

export function ScatterSection({ sectionId }: { sectionId: string }) {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const definition = presentationSection(lens.snapshot, sectionId, "scatter");
  const [defaultXField, defaultYField] = presentationFields(lens.snapshot, [
    definition.xFieldId,
    definition.yFieldId,
  ]);
  const numericFields = lens.snapshot.experiment.fields.filter(
    (field) => field.valueType === "number",
  );
  const [xFieldId, setXFieldId] = useState(definition.xFieldId);
  const [yFieldId, setYFieldId] = useState(definition.yFieldId);
  const xField =
    numericFields.find((field) => field.id === xFieldId) ?? defaultXField;
  const yField =
    numericFields.find((field) => field.id === yFieldId) ?? defaultYField;
  const category = definition.colorFieldId
    ? (presentationFields(lens.snapshot, [definition.colorFieldId])[0] ?? null)
    : null;
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
      const coordinate = chartCoordinate(event, chart);
      if (!coordinate) {
        return;
      }
      const nearest = nearestObservation(
        lens,
        xField.id,
        yField.id,
        coordinate,
      );
      if (nearest && nearest.distance < 0.12) {
        lens.actions.focusObservation(nearest.id);
      }
    },
    [lens, xField, yField],
  );
  const selectionResolver = useCallback(
    (gesture: ChartSelectionGesture, chart: LensChart) =>
      xField && yField
        ? observationsInGesture(lens, xField.id, yField.id, gesture, chart)
        : [],
    [lens, xField, yField],
  );
  if (!xField || !yField) {
    throw new Error(`Scatter section ${sectionId} has invalid field bindings.`);
  }
  return (
    <div className="lens-chart-section" data-lens-section="scatter">
      <div className="lens-chart-toolbar">
        <label>
          <span>X</span>
          <select
            aria-label="Scatter horizontal axis"
            onChange={(event) => setXFieldId(event.target.value)}
            value={xField.id}
          >
            {numericFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Y</span>
          <select
            aria-label="Scatter vertical axis"
            onChange={(event) => setYFieldId(event.target.value)}
            value={yField.id}
          >
            {numericFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
        {category ? <span>Color · {category.label}</span> : null}
        <span className="lens-chart-count">{lens.visible.length} visible</span>
      </div>
      <AnnotatedChartSurface
        ariaLabel={`${yField.label} by ${xField.label}`}
        chartFieldIds={[
          xField.id,
          yField.id,
          ...(category ? [category.id] : []),
        ]}
        events={events}
        onPointer={handlePointer}
        option={option}
        sectionId={sectionId}
        selectionLabel="Select points"
        selectionResolver={selectionResolver}
      />
    </div>
  );
}
