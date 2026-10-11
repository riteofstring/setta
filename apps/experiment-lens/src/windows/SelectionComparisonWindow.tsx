import { useWorkspaceAppearance } from "@riteofstring/setta";
import { useMemo } from "react";

import { useLens } from "../app/lensContext";
import {
  formatScalar,
  numericMetricFields,
  seriesArtifactForObservation,
} from "../app/lensModel";
import { EChartSurface } from "../charts/EChartSurface";
import { chartPalette } from "../charts/chartOptions";

const COLORS = ["#60a5fa", "#51d6c7", "#f8b551", "#c084fc"];

export function SelectionComparisonWindow() {
  const lens = useLens();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  const observations = lens.selection.selectedObservationIds
    .slice(0, 4)
    .map((id) =>
      lens.snapshot.observations.find((observation) => observation.id === id),
    )
    .filter((observation) => observation !== undefined);
  const metrics = numericMetricFields(lens.snapshot).slice(0, 4);
  const traces = observations.flatMap((observation, index) => {
    const artifact = seriesArtifactForObservation(
      lens.snapshot,
      observation.id,
    );
    if (
      !artifact ||
      artifact.status !== "resolved" ||
      artifact.content.kind !== "series"
    ) {
      return [];
    }
    const definition =
      artifact.content.series.series.find((series) =>
        /temp/iu.test(series.id),
      ) ?? artifact.content.series.series[0];
    if (!definition) {
      return [];
    }
    return [
      {
        color: COLORS[index % COLORS.length],
        data: artifact.content.series.samples.map((sample) => [
          sample.x,
          sample.values[definition.id],
        ]),
        label: `${observation.id} · ${definition.label}`,
      },
    ];
  });
  const palette = chartPalette(darkMode);
  const option = useMemo(
    () => ({
      animationDuration: 180,
      aria: { enabled: true },
      grid: { bottom: 36, containLabel: true, left: 14, right: 20, top: 36 },
      legend: {
        itemHeight: 4,
        itemWidth: 16,
        textStyle: { color: palette.muted, fontSize: 9 },
        top: 6,
      },
      series: traces.map((trace) => ({
        data: trace.data,
        lineStyle: { color: trace.color, width: 2 },
        name: trace.label,
        showSymbol: false,
        smooth: 0.16,
        type: "line",
      })),
      tooltip: {
        axisPointer: { type: "cross" },
        backgroundColor: palette.tooltipBackground,
        borderColor: palette.grid,
        confine: true,
        renderMode: "richText" as const,
        textStyle: { color: palette.text, fontSize: 10 },
        trigger: "axis",
      },
      xAxis: {
        axisLabel: { color: palette.muted, fontSize: 9 },
        axisLine: { lineStyle: { color: palette.axis } },
        splitLine: { show: false },
        type: "value",
      },
      yAxis: {
        axisLabel: { color: palette.muted, fontSize: 9 },
        axisLine: { lineStyle: { color: palette.axis } },
        scale: true,
        splitLine: { lineStyle: { color: palette.grid } },
        type: "value",
      },
    }),
    [palette, traces],
  );
  if (observations.length < 2) {
    return (
      <div className="lens-comparison-empty">
        Select at least two observations to compare them.
      </div>
    );
  }
  return (
    <div className="lens-comparison" data-lens-comparison="true">
      {lens.selection.selectedObservationIds.length > observations.length ? (
        <p className="lens-comparison-limit">
          Showing first {observations.length} of{" "}
          {lens.selection.selectedObservationIds.length} selected observations.
          Export includes all.
        </p>
      ) : null}
      <div className="lens-comparison-table" role="table">
        <div className="lens-comparison-row" role="row">
          <strong role="columnheader">Observation</strong>
          {metrics.map((metric) => (
            <strong key={metric.id} role="columnheader">
              {metric.label}
            </strong>
          ))}
        </div>
        {observations.map((observation, index) => (
          <button
            className="lens-comparison-row"
            key={observation.id}
            onClick={() => lens.actions.focusObservation(observation.id)}
            role="row"
            type="button"
          >
            <span role="cell">
              <i style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              {observation.id}
            </span>
            {metrics.map((metric) => (
              <span key={metric.id} role="cell">
                {formatScalar(observation.values[metric.id], metric)}
              </span>
            ))}
          </button>
        ))}
      </div>
      {traces.length > 0 ? (
        <EChartSurface
          ariaLabel="Selected observation trace comparison"
          option={option}
        />
      ) : null}
    </div>
  );
}
