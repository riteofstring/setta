import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixture");
const chemistries = ["LFP", "NMC811", "LCO"];
const ambients = [15, 25, 40, 25, 15, 40, 25, 40];
const chargeRates = [0.5, 1, 1.5, 2, 1, 0.5, 2, 1.5];
const frameCycles = [25, 250, 475, 700, 900];

function round(value, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function emit(path, content) {
  const bytes = Buffer.from(content);
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return {
    byteLength: bytes.byteLength,
    path: relative(root, absolute).replaceAll("\\", "/"),
    sha256: digest(bytes),
  };
}

function thermalColor(value, minimum, maximum) {
  const ratio = Math.max(
    0,
    Math.min(1, (value - minimum) / (maximum - minimum)),
  );
  return `hsl(${round(218 - ratio * 218, 1)} 82% ${round(42 + ratio * 12, 1)}%)`;
}

function batteryMetrics(
  cellNumber,
  chemistry,
  ambient,
  chargeRate,
  cycleIndex,
) {
  const cycle = cycleIndex * 25;
  const progress = cycle / 900;
  const chemistryDecay = { LCO: 17.5, LFP: 6.2, NMC811: 11.7 }[chemistry];
  const heatPenalty = Math.max(0, ambient - 25) * 0.19;
  const ratePenalty = Math.max(0, chargeRate - 0.5) * 2.3;
  const anomaly = [7, 18, 22].includes(cellNumber) ? progress * 4.8 : 0;
  const cellVariance = Math.sin(cellNumber * 1.7 + cycleIndex * 0.31) * 0.42;
  const capacityRetention =
    100 -
    progress * (chemistryDecay + heatPenalty + ratePenalty) -
    anomaly +
    cellVariance;
  const resistance =
    18 +
    (chemistry === "LFP" ? 3 : chemistry === "NMC811" ? 0 : -2) +
    progress * (12 + chemistryDecay * 0.7 + heatPenalty) +
    chargeRate * 1.8 +
    Math.cos(cellNumber + cycleIndex * 0.2) * 0.7;
  const peakTemperature =
    ambient + 6.8 + chargeRate * 8.1 + progress * 4.6 + (cellNumber % 5) * 0.35;
  const chargeEfficiency =
    99.45 -
    progress * (0.65 + ratePenalty * 0.08) -
    Math.max(0, ambient - 25) * 0.015;
  const voltageNoise =
    2.1 + chargeRate * 1.9 + progress * 3.8 + (cellNumber % 4) * 0.34;
  const healthIndex = capacityRetention - Math.max(0, resistance - 20) * 0.18;
  return {
    capacityRetention: round(capacityRetention, 3),
    chargeEfficiency: round(chargeEfficiency, 3),
    healthIndex: round(healthIndex, 3),
    peakTemperature: round(peakTemperature, 3),
    resistance: round(resistance, 3),
    voltageNoise: round(voltageNoise, 3),
  };
}

function thermalSvg(cellNumber, chemistry, ambient, chargeRate, cycle) {
  const peak =
    ambient + chargeRate * 8.2 + (cycle / 900) * 5.1 + (cellNumber % 5) * 0.55;
  const cells = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const distance = Math.hypot(column - 4.1, row - 2.2);
      const value =
        peak - distance * 1.25 + Math.sin(cellNumber + row * 2 + column) * 0.6;
      cells.push(
        `<rect x="${22 + column * 48}" y="${60 + row * 42}" width="42" height="36" rx="4" fill="${thermalColor(value, 15, 66)}"/><text x="${43 + column * 48}" y="${83 + row * 42}" text-anchor="middle" fill="#f8fafc" font-size="9" font-family="ui-monospace,monospace">${value.toFixed(1)}</text>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430 320" role="img" aria-label="Thermal frame for cell ${String(cellNumber).padStart(2, "0")}">
<rect width="430" height="320" fill="#09111d"/>
<text x="22" y="30" fill="#dbeafe" font-size="15" font-family="Inter,system-ui,sans-serif" font-weight="600">Cell ${String(cellNumber).padStart(2, "0")} · ${chemistry}</text>
<text x="408" y="30" text-anchor="end" fill="#8da2c2" font-size="12" font-family="ui-monospace,monospace">cycle ${cycle} · ${ambient}°C · ${chargeRate}C</text>
${cells.join("\n")}
<text x="22" y="296" fill="#7890b5" font-size="10" font-family="Inter,system-ui,sans-serif">Surface temperature · °C</text>
<rect x="280" y="286" width="128" height="10" rx="5" fill="url(#scale)"/>
<defs><linearGradient id="scale"><stop stop-color="hsl(218 82% 42%)"/><stop offset=".5" stop-color="hsl(109 82% 48%)"/><stop offset="1" stop-color="hsl(0 82% 54%)"/></linearGradient></defs>
</svg>
`;
}

function seriesDocument(cellNumber, chemistry, ambient, chargeRate) {
  const samples = Array.from({ length: 36 }, (_, index) => {
    const cycleIndex = index + 1;
    const cycle = cycleIndex * 25;
    const metrics = batteryMetrics(
      cellNumber,
      chemistry,
      ambient,
      chargeRate,
      cycleIndex,
    );
    return {
      values: {
        capacity_retention_pct: metrics.capacityRetention,
        charge_efficiency_pct: metrics.chargeEfficiency,
        health_index_pct: metrics.healthIndex,
      },
      x: cycle,
    };
  });
  return {
    axis: { id: "cycle", label: "Cycle", unit: null },
    samples,
    schemaVersion: "setta-series/v1",
    series: [
      { id: "capacity_retention_pct", label: "Capacity retention", unit: "%" },
      { id: "charge_efficiency_pct", label: "Charge efficiency", unit: "%" },
      { id: "health_index_pct", label: "Health index", unit: "%" },
    ],
  };
}

await rm(root, { force: true, recursive: true });
const artifacts = [];
const relations = [];
const observations = [];

for (let cellNumber = 1; cellNumber <= 24; cellNumber += 1) {
  const chemistry = chemistries[Math.floor((cellNumber - 1) / 8)];
  const ambient = ambients[(cellNumber - 1) % ambients.length];
  const chargeRate = chargeRates[(cellNumber - 1) % chargeRates.length];
  const cellId = `cell-${String(cellNumber).padStart(2, "0")}`;
  const seriesId = `series-${cellId}`;
  const seriesFile = await emit(
    `artifacts/series/${cellId}.json`,
    json(seriesDocument(cellNumber, chemistry, ambient, chargeRate)),
  );
  artifacts.push({
    id: seriesId,
    label: `Cell ${String(cellNumber).padStart(2, "0")} aging trajectory`,
    mediaType: "application/vnd.setta.series+json",
    ...seriesFile,
  });
  for (const cycle of frameCycles) {
    const frameId = `thermal-${cellId}-${String(cycle).padStart(4, "0")}`;
    const frameFile = await emit(
      `artifacts/thermal/${cellId}-${String(cycle).padStart(4, "0")}.svg`,
      thermalSvg(cellNumber, chemistry, ambient, chargeRate, cycle),
    );
    artifacts.push({
      id: frameId,
      label: `Cell ${String(cellNumber).padStart(2, "0")} thermal frame`,
      mediaType: "image/svg+xml",
      ...frameFile,
    });
  }
  for (let cycleIndex = 1; cycleIndex <= 36; cycleIndex += 1) {
    const cycle = cycleIndex * 25;
    const metrics = batteryMetrics(
      cellNumber,
      chemistry,
      ambient,
      chargeRate,
      cycleIndex,
    );
    const observationId = `${cellId}-cycle-${String(cycle).padStart(4, "0")}`;
    observations.push({
      id: observationId,
      values: {
        ambient_c: ambient,
        capacity_retention_pct: metrics.capacityRetention,
        cell: cellId,
        charge_efficiency_pct: metrics.chargeEfficiency,
        charge_rate_c: chargeRate,
        chemistry,
        cycle,
        peak_temp_c: metrics.peakTemperature,
        resistance_mohm: metrics.resistance,
        voltage_noise_mv: metrics.voltageNoise,
      },
    });
    relations.push({
      artifactId: seriesId,
      observationId,
      role: "aging-trajectory",
      timeline: null,
    });
    for (const frameCycle of frameCycles) {
      relations.push({
        artifactId: `thermal-${cellId}-${String(frameCycle).padStart(4, "0")}`,
        observationId,
        role: `thermal-frame-${String(frameCycle).padStart(4, "0")}`,
        timeline: { axisId: "cycle", value: frameCycle },
      });
    }
  }
}

observations.sort(
  (left, right) =>
    left.values.capacity_retention_pct - right.values.capacity_retention_pct,
);
const observationFile = await emit(
  "data/observations.json",
  json({ experimentId: "battery-aging-study", observations, version: 1 }),
);
const presentation = {
  initialViewId: "overview",
  sections: [
    {
      fieldIds: ["chemistry", "ambient_c", "charge_rate_c", "cycle"],
      id: "cohort",
      title: "Explore the cohort",
      type: "facets",
    },
    {
      aggregation: "mean",
      fieldIds: [
        "capacity_retention_pct",
        "resistance_mohm",
        "peak_temp_c",
        "charge_efficiency_pct",
      ],
      id: "headline-metrics",
      title: "Visible cohort",
      type: "metrics",
    },
    {
      colorFieldId: "chemistry",
      id: "retention-population",
      title: "Capacity retention by cycle",
      type: "scatter",
      xFieldId: "cycle",
      yFieldId: "capacity_retention_pct",
    },
    {
      bins: 24,
      fieldId: "resistance_mohm",
      id: "resistance-distribution",
      title: "Resistance distribution",
      type: "histogram",
    },
    {
      aggregation: "mean",
      id: "condition-heatmap",
      title: "Mean retention by test condition",
      type: "heatmap",
      valueFieldId: "capacity_retention_pct",
      xFieldId: "charge_rate_c",
      yFieldId: "ambient_c",
    },
    {
      fieldIds: [
        "ambient_c",
        "charge_rate_c",
        "cycle",
        "capacity_retention_pct",
        "resistance_mohm",
        "peak_temp_c",
        "charge_efficiency_pct",
        "voltage_noise_mv",
      ],
      id: "multivariate",
      title: "Multivariate relationships",
      type: "parallel",
    },
    {
      fieldIds: [
        "cell",
        "chemistry",
        "ambient_c",
        "charge_rate_c",
        "cycle",
        "capacity_retention_pct",
        "resistance_mohm",
        "peak_temp_c",
        "charge_efficiency_pct",
        "voltage_noise_mv",
      ],
      id: "observations",
      title: "Observations",
      type: "table",
    },
    {
      artifactRole: "aging-trajectory",
      detailFieldIds: ["cell", "chemistry", "ambient_c", "charge_rate_c"],
      id: "aging-timeline",
      title: "Cell aging trajectory",
      type: "timeline",
    },
    {
      artifactRoles: frameCycles.map(
        (cycle) => `thermal-frame-${String(cycle).padStart(4, "0")}`,
      ),
      columns: 3,
      id: "thermal-gallery",
      title: "Thermal progression",
      type: "gallery",
    },
  ],
  views: [
    {
      id: "overview",
      name: "Overview",
      placements: [
        { height: 260, sectionId: "cohort", width: 1320, x: 64, y: 64 },
        {
          height: 260,
          sectionId: "headline-metrics",
          width: 1320,
          x: 64,
          y: 364,
        },
        {
          height: 430,
          sectionId: "retention-population",
          width: 800,
          x: 64,
          y: 664,
        },
        {
          height: 430,
          sectionId: "resistance-distribution",
          width: 480,
          x: 904,
          y: 664,
        },
        {
          height: 430,
          sectionId: "condition-heatmap",
          width: 1320,
          x: 64,
          y: 1134,
        },
      ],
      viewport: { x: 320, y: 12, zoom: 0.76 },
    },
    {
      id: "compare",
      name: "Compare",
      placements: [
        {
          height: 260,
          sectionId: "cohort",
          width: 1320,
          x: 64,
          y: 64,
        },
        {
          height: 520,
          sectionId: "multivariate",
          width: 1320,
          x: 64,
          y: 364,
        },
        {
          height: 480,
          sectionId: "observations",
          width: 1320,
          x: 64,
          y: 924,
        },
      ],
      viewport: { x: 320, y: 12, zoom: 0.76 },
    },
    {
      id: "inspect",
      name: "Inspect",
      placements: [
        {
          height: 340,
          sectionId: "observations",
          width: 1320,
          x: 64,
          y: 64,
        },
        {
          height: 470,
          sectionId: "aging-timeline",
          width: 720,
          x: 64,
          y: 444,
        },
        {
          height: 470,
          sectionId: "thermal-gallery",
          width: 560,
          x: 824,
          y: 444,
        },
      ],
      viewport: { x: 320, y: 12, zoom: 0.76 },
    },
  ],
};
const manifest = {
  artifacts,
  fields: [
    {
      description: "Cell chemistry family",
      id: "chemistry",
      label: "Chemistry",
      nullable: false,
      role: "factor",
      unit: null,
      valueType: "string",
    },
    {
      description: "Ambient chamber temperature",
      id: "ambient_c",
      label: "Ambient",
      nullable: false,
      role: "factor",
      unit: "°C",
      valueType: "number",
    },
    {
      description: "Applied charge rate",
      id: "charge_rate_c",
      label: "Charge rate",
      nullable: false,
      role: "factor",
      unit: "C",
      valueType: "number",
    },
    {
      description: "Completed equivalent full cycles",
      id: "cycle",
      label: "Cycle",
      nullable: false,
      role: "factor",
      unit: null,
      valueType: "number",
    },
    {
      description: "Stable cell identity",
      id: "cell",
      label: "Cell",
      nullable: false,
      role: "factor",
      unit: null,
      valueType: "string",
    },
    {
      description: "Discharge capacity relative to beginning of life",
      id: "capacity_retention_pct",
      label: "Capacity retention",
      nullable: false,
      role: "metric",
      unit: "%",
      valueType: "number",
    },
    {
      description: "Measured direct-current internal resistance",
      id: "resistance_mohm",
      label: "Resistance",
      nullable: false,
      role: "metric",
      unit: "mΩ",
      valueType: "number",
    },
    {
      description: "Peak surface temperature during charge",
      id: "peak_temp_c",
      label: "Peak temperature",
      nullable: false,
      role: "metric",
      unit: "°C",
      valueType: "number",
    },
    {
      description: "Charge coulombic efficiency",
      id: "charge_efficiency_pct",
      label: "Charge efficiency",
      nullable: false,
      role: "metric",
      unit: "%",
      valueType: "number",
    },
    {
      description: "Peak-to-peak voltage measurement noise",
      id: "voltage_noise_mv",
      label: "Voltage noise",
      nullable: false,
      role: "metric",
      unit: "mV",
      valueType: "number",
    },
  ],
  id: "battery-aging-study",
  observations: observationFile,
  provenance: {
    createdAt: "2026-09-19T00:00:00Z",
    producer: { kind: "script", name: "Setta battery playground generator" },
  },
  presentation,
  relations,
  summary:
    "A synthetic but internally consistent accelerated-aging study across 24 battery cells, three chemistries, four charge rates, three chamber temperatures, and 900 equivalent full cycles.",
  title: "Accelerated battery aging",
  version: 1,
};
await emit("experiment.json", json(manifest));
