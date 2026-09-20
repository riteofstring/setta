import type {
  BarSeriesOption,
  EChartsCoreOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  ParallelSeriesOption,
  ScatterSeriesOption,
} from "echarts";

import type {
  FieldDefinition,
  JsonScalar,
  LensSelection,
  Observation,
  SeriesDocument,
} from "../backend/generatedContract";
import type { HistogramBin, LensAggregation } from "../app/aggregation";
import { formatScalar } from "../app/lensModel";

const SERIES_COLORS = [
  "#60a5fa",
  "#51d6c7",
  "#f8b551",
  "#c084fc",
  "#fb7185",
  "#94a3b8",
];

type LensChartPalette = Readonly<{
  axis: string;
  emptyCell: string;
  grid: string;
  muted: string;
  panel: string;
  text: string;
  tooltipBackground: string;
}>;

export function chartPalette(darkMode: boolean): LensChartPalette {
  return darkMode
    ? {
        axis: "#506078",
        emptyCell: "#182231",
        grid: "#253043",
        muted: "#8795aa",
        panel: "#111926",
        text: "#cbd5e1",
        tooltipBackground: "#0b1018",
      }
    : {
        axis: "#a6b1c2",
        emptyCell: "#edf1f6",
        grid: "#dfe5ee",
        muted: "#64748b",
        panel: "#ffffff",
        text: "#263248",
        tooltipBackground: "#ffffff",
      };
}

function commonOption(palette: LensChartPalette): EChartsCoreOption {
  return {
    animation: false,
    aria: { enabled: true },
    textStyle: {
      color: palette.text,
      fontFamily: "Inter, system-ui, sans-serif",
    },
    tooltip: tooltipOption(palette),
  };
}

function tooltipOption(palette: LensChartPalette) {
  return {
    backgroundColor: palette.tooltipBackground,
    borderColor: palette.grid,
    borderRadius: 6,
    borderWidth: 1,
    confine: true,
    renderMode: "richText" as const,
    textStyle: { color: palette.text, fontSize: 12 },
  };
}

function valueNumber(
  observation: Observation,
  field: FieldDefinition,
): number | null {
  const value = observation.values[field.id];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function categoryValue(
  observation: Observation,
  field: FieldDefinition | null,
): string {
  if (!field) {
    return "Observations";
  }
  return formatScalar(observation.values[field.id], field);
}

export function scatterOption({
  category,
  observations,
  palette,
  selection,
  xField,
  yField,
}: {
  category: FieldDefinition | null;
  observations: readonly Observation[];
  palette: LensChartPalette;
  selection: LensSelection;
  xField: FieldDefinition;
  yField: FieldDefinition;
}): EChartsCoreOption {
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (
      valueNumber(observation, xField) === null ||
      valueNumber(observation, yField) === null
    ) {
      continue;
    }
    const key = categoryValue(observation, category);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const selected = new Set(selection.selectedObservationIds);
  const series: ScatterSeriesOption[] = [...groups.entries()].map(
    ([name, group], index) => ({
      data: group.map((observation) => {
        const isFocused = observation.id === selection.focusedObservationId;
        const isSelected = selected.has(observation.id);
        return {
          id: observation.id,
          itemStyle: {
            borderColor: isFocused
              ? "#f8fafc"
              : isSelected
                ? "#4ade80"
                : SERIES_COLORS[index % SERIES_COLORS.length],
            borderWidth: isFocused ? 3 : isSelected ? 2 : 0,
            color: SERIES_COLORS[index % SERIES_COLORS.length],
            opacity: isFocused || isSelected ? 1 : 0.68,
          },
          name: observation.id,
          symbolSize: isFocused ? 13 : isSelected ? 10 : 6,
          value: [
            valueNumber(observation, xField),
            valueNumber(observation, yField),
          ],
        };
      }),
      emphasis: { focus: "none", scale: 1.6 },
      large: observations.length > 4_000,
      name,
      type: "scatter",
    }),
  );
  return {
    ...commonOption(palette),
    grid: { bottom: 48, containLabel: true, left: 20, right: 22, top: 28 },
    legend:
      groups.size > 1 && groups.size <= 8
        ? {
            itemHeight: 7,
            itemWidth: 7,
            left: 14,
            textStyle: { color: palette.muted, fontSize: 11 },
            top: 3,
          }
        : undefined,
    series,
    tooltip: {
      ...tooltipOption(palette),
      formatter: (params: {
        name: string;
        seriesName: string;
        value: number[];
      }) =>
        [
          params.name,
          category ? `${category.label}: ${params.seriesName}` : "",
          `${xField.label}: ${formatScalar(params.value[0], xField)}`,
          `${yField.label}: ${formatScalar(params.value[1], yField)}`,
        ]
          .filter(Boolean)
          .join("\n"),
    },
    xAxis: {
      axisLabel: { color: palette.muted, fontSize: 11 },
      axisLine: { lineStyle: { color: palette.axis } },
      axisTick: { show: false },
      name: xField.unit ? `${xField.label} · ${xField.unit}` : xField.label,
      nameLocation: "middle",
      nameTextStyle: { color: palette.muted, fontSize: 11, padding: 28 },
      scale: true,
      splitLine: { lineStyle: { color: palette.grid } },
      type: "value",
    },
    yAxis: {
      axisLabel: { color: palette.muted, fontSize: 11 },
      axisLine: { lineStyle: { color: palette.axis } },
      axisTick: { show: false },
      name: yField.unit ? `${yField.label} · ${yField.unit}` : yField.label,
      nameGap: 38,
      nameLocation: "middle",
      nameTextStyle: { color: palette.muted, fontSize: 11 },
      scale: true,
      splitLine: { lineStyle: { color: palette.grid } },
      type: "value",
    },
  };
}

export function histogramOption({
  bins,
  field,
  palette,
  selection,
}: {
  bins: readonly HistogramBin[];
  field: FieldDefinition;
  palette: LensChartPalette;
  selection: LensSelection;
}): EChartsCoreOption {
  const labels = bins.map(
    (bin) =>
      `${formatScalar(bin.minimum, field)}–${formatScalar(bin.maximum, field)}`,
  );
  const selected = new Set(selection.selectedObservationIds);
  const series: BarSeriesOption = {
    barMaxWidth: 28,
    data: bins.map((bin) => {
      const selectedCount = bin.observationIds.filter((observationId) =>
        selected.has(observationId),
      ).length;
      return {
        itemStyle:
          selectedCount > 0
            ? {
                borderColor:
                  selectedCount === bin.observationIds.length
                    ? "#4ade80"
                    : "#f8b551",
                borderWidth: 3,
                opacity: 1,
              }
            : undefined,
        value: bin.count,
      };
    }),
    emphasis: { itemStyle: { color: "#51d6c7" } },
    itemStyle: { color: SERIES_COLORS[0], opacity: 0.82 },
    name: field.label,
    type: "bar",
  };
  return {
    ...commonOption(palette),
    grid: { bottom: 48, containLabel: true, left: 18, right: 20, top: 18 },
    series: [series],
    tooltip: {
      ...tooltipOption(palette),
      formatter: (params: { dataIndex: number; value: number }) =>
        `${labels[params.dataIndex] ?? field.label}\n${String(params.value)} observations`,
    },
    xAxis: {
      axisLabel: { color: palette.muted, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: palette.axis } },
      axisTick: { show: false },
      data: labels,
      type: "category",
    },
    yAxis: {
      axisLabel: { color: palette.muted, fontSize: 10 },
      axisLine: { show: false },
      minInterval: 1,
      splitLine: { lineStyle: { color: palette.grid } },
      type: "value",
    },
  };
}

export function heatmapOption({
  aggregation,
  cells,
  palette,
  selection,
  valueField,
  xChoices,
  xField,
  yChoices,
  yField,
}: {
  aggregation: LensAggregation;
  cells: readonly Readonly<{
    observationIds: readonly string[];
    value: number | null;
    xIndex: number;
    yIndex: number;
  }>[];
  palette: LensChartPalette;
  selection: LensSelection;
  valueField: FieldDefinition;
  xChoices: readonly JsonScalar[];
  xField: FieldDefinition;
  yChoices: readonly JsonScalar[];
  yField: FieldDefinition;
}): EChartsCoreOption {
  const selected = new Set(selection.selectedObservationIds);
  const cellData = (cell: (typeof cells)[number], value: number) => {
    const selectedCount = cell.observationIds.filter((observationId) =>
      selected.has(observationId),
    ).length;
    return {
      itemStyle:
        selectedCount > 0
          ? {
              borderColor:
                selectedCount === cell.observationIds.length
                  ? "#4ade80"
                  : "#f8b551",
              borderWidth: 4,
            }
          : undefined,
      value: [cell.xIndex, cell.yIndex, value],
    };
  };
  const data = cells
    .filter(
      (cell): cell is typeof cell & { value: number } => cell.value !== null,
    )
    .map((cell) => cellData(cell, cell.value));
  const values = data.map((cell) => cell.value[2] ?? 0);
  const minimum = values.length > 0 ? Math.min(...values) : 0;
  const maximum = values.length > 0 ? Math.max(...values) : 1;
  const missingData = cells
    .filter((cell) => cell.value === null)
    .map((cell) => cellData(cell, minimum));
  const series: HeatmapSeriesOption = {
    data,
    emphasis: { itemStyle: { borderColor: palette.text, borderWidth: 2 } },
    itemStyle: {
      borderColor: palette.panel,
      borderRadius: 5,
      borderWidth: 4,
    },
    label: {
      color: "#f8fafc",
      formatter: (params: { value?: unknown }) => {
        const value = Array.isArray(params.value) ? params.value[2] : null;
        return typeof value === "number"
          ? formatScalar(
              value,
              aggregation === "count" ? undefined : valueField,
            )
          : "";
      },
      fontSize: 10,
      fontWeight: 650,
      show: data.length <= 36,
      textBorderColor: "rgb(5 12 24 / 45%)",
      textBorderWidth: 2,
    },
    name: valueField.label,
    type: "heatmap",
  };
  const missingSeries: HeatmapSeriesOption = {
    data: missingData,
    itemStyle: {
      borderColor: palette.panel,
      borderRadius: 5,
      borderWidth: 4,
      color: palette.emptyCell,
    },
    label: {
      color: palette.muted,
      fontSize: 12,
      formatter: "—",
      show: true,
    },
    name: "No observations",
    silent: true,
    tooltip: { show: false },
    type: "heatmap",
  };
  return {
    ...commonOption(palette),
    grid: { bottom: 52, containLabel: true, left: 20, right: 78, top: 22 },
    series: missingData.length > 0 ? [series, missingSeries] : [series],
    tooltip: {
      ...tooltipOption(palette),
      formatter: (params: { value: number[] }) => {
        const xValue = xChoices[params.value[0] ?? -1];
        const yValue = yChoices[params.value[1] ?? -1];
        const value = params.value[2];
        return [
          `${xField.label}: ${formatScalar(xValue, xField)}`,
          `${yField.label}: ${formatScalar(yValue, yField)}`,
          `${aggregation} ${valueField.label}: ${formatScalar(value, aggregation === "count" ? undefined : valueField)}`,
        ].join("\n");
      },
    },
    visualMap: {
      calculable: false,
      inRange: {
        color: ["#1d4ed8", "#2563eb", "#0ea5e9", "#22d3ee"],
      },
      max: maximum === minimum ? minimum + 1 : maximum,
      min: minimum,
      orient: "vertical",
      right: 8,
      seriesIndex: 0,
      show: data.length > 0,
      textStyle: { color: palette.muted, fontSize: 10 },
      top: "middle",
    },
    xAxis: {
      axisLabel: { color: palette.muted, fontSize: 10 },
      axisLine: { lineStyle: { color: palette.axis } },
      data: xChoices.map((value) => formatScalar(value, xField)),
      name: xField.label,
      nameLocation: "middle",
      nameTextStyle: { color: palette.muted, padding: 28 },
      splitArea: { show: false },
      splitLine: { show: false },
      type: "category",
    },
    yAxis: {
      axisLabel: { color: palette.muted, fontSize: 10 },
      axisLine: { lineStyle: { color: palette.axis } },
      data: yChoices.map((value) => formatScalar(value, yField)),
      name: yField.label,
      nameLocation: "middle",
      nameTextStyle: { color: palette.muted, padding: 34 },
      splitArea: { show: false },
      splitLine: { show: false },
      type: "category",
    },
  };
}

export function parallelOption({
  fields,
  observations,
  palette,
  selection,
}: {
  fields: readonly FieldDefinition[];
  observations: readonly Observation[];
  palette: LensChartPalette;
  selection: LensSelection;
}): EChartsCoreOption {
  const selected = new Set(selection.selectedObservationIds);
  const regular: Array<{ name: string; value: Array<number | string> }> = [];
  const emphasized: Array<{ name: string; value: Array<number | string> }> = [];
  for (const observation of observations) {
    const values = fields.map((field) => {
      const value = observation.values[field.id];
      return typeof value === "number" || typeof value === "string"
        ? value
        : "—";
    });
    const record = { name: observation.id, value: values };
    if (
      observation.id === selection.focusedObservationId ||
      selected.has(observation.id)
    ) {
      emphasized.push(record);
    } else {
      regular.push(record);
    }
  }
  const series: ParallelSeriesOption[] = [
    {
      data: regular,
      lineStyle: { color: SERIES_COLORS[0], opacity: 0.12, width: 1 },
      name: "Visible cohort",
      progressive: 1_000,
      type: "parallel",
    },
    {
      data: emphasized,
      lineStyle: { color: "#4ade80", opacity: 0.88, width: 2.2 },
      name: "Selected",
      type: "parallel",
    },
  ];
  return {
    ...commonOption(palette),
    parallel: {
      bottom: 34,
      left: 45,
      parallelAxisDefault: {},
      right: 36,
      top: 42,
    },
    parallelAxis: fields.map((field, index) => ({
      axisLabel: { color: palette.muted, fontSize: 10 },
      axisLine: { lineStyle: { color: palette.axis } },
      dim: index,
      id: field.id,
      name: field.unit ? `${field.label}\n${field.unit}` : field.label,
      nameLocation: "end",
      nameTextStyle: { color: palette.text, fontSize: 11 },
      type: field.valueType === "number" ? "value" : "category",
    })),
    series,
    tooltip: { show: false },
  };
}

export function seriesOption({
  cursor,
  document,
  palette,
  range,
}: {
  cursor: number | null;
  document: SeriesDocument;
  palette: LensChartPalette;
  range: { end: number; start: number } | null;
}): EChartsCoreOption {
  const xs = document.samples.map((sample) => sample.x);
  const minimum = Math.min(...xs);
  const maximum = Math.max(...xs);
  const rangeStart = range?.start ?? minimum;
  const rangeEnd = range?.end ?? maximum;
  const start =
    maximum === minimum
      ? 0
      : ((rangeStart - minimum) / (maximum - minimum)) * 100;
  const end =
    maximum === minimum
      ? 100
      : ((rangeEnd - minimum) / (maximum - minimum)) * 100;
  const series: LineSeriesOption[] = document.series.map(
    (definition, index) => ({
      data: document.samples.map((sample) => [
        sample.x,
        sample.values[definition.id],
      ]),
      emphasis: { focus: "series" },
      lineStyle: {
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        width: 1.8,
      },
      markLine:
        index === 0 && cursor !== null
          ? {
              animation: false,
              data: [{ xAxis: cursor }],
              label: { show: false },
              lineStyle: { color: "#e2e8f0", opacity: 0.7, type: "solid" },
              silent: true,
              symbol: "none",
            }
          : undefined,
      name: definition.label,
      showSymbol: false,
      smooth: 0.16,
      type: "line",
    }),
  );
  return {
    ...commonOption(palette),
    dataZoom: [
      { end, filterMode: "none", realtime: false, start, type: "inside" },
      {
        bottom: 6,
        brushSelect: false,
        dataBackground: { lineStyle: { color: palette.axis } },
        end,
        fillerColor: "rgba(96,165,250,.14)",
        height: 15,
        realtime: false,
        selectedDataBackground: { lineStyle: { color: "#60a5fa" } },
        start,
        textStyle: { color: palette.muted, fontSize: 10 },
        type: "slider",
      },
    ],
    grid: { bottom: 48, containLabel: true, left: 18, right: 24, top: 34 },
    legend: {
      itemHeight: 3,
      itemWidth: 16,
      left: 12,
      textStyle: { color: palette.muted, fontSize: 10 },
      top: 5,
    },
    series,
    tooltip: {
      ...tooltipOption(palette),
      axisPointer: { type: "cross" },
      trigger: "axis",
      valueFormatter: (value: unknown) =>
        typeof value === "number" ? value.toFixed(3) : String(value ?? "—"),
    },
    xAxis: {
      axisLabel: { color: palette.muted, fontSize: 10 },
      axisLine: { lineStyle: { color: palette.axis } },
      name: document.axis.unit
        ? `${document.axis.label} · ${document.axis.unit}`
        : document.axis.label,
      nameLocation: "middle",
      nameTextStyle: { color: palette.muted, fontSize: 10, padding: 25 },
      type: "value",
    },
    yAxis: {
      axisLabel: { color: palette.muted, fontSize: 10 },
      axisLine: { lineStyle: { color: palette.axis } },
      scale: true,
      splitLine: { lineStyle: { color: palette.grid } },
      type: "value",
    },
  };
}
