import type { LensSnapshot } from "../backend/generatedContract";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);

export function lensTestSnapshot(): LensSnapshot {
  const fields = [
    {
      description: "Chemistry family",
      id: "chemistry",
      label: "Chemistry",
      nullable: false,
      role: "factor" as const,
      unit: null,
      valueType: "string" as const,
    },
    {
      description: "Completed cycles",
      id: "cycle",
      label: "Cycle",
      nullable: false,
      role: "factor" as const,
      unit: null,
      valueType: "number" as const,
    },
    {
      description: "Capacity relative to beginning of life",
      id: "retention",
      label: "Retention",
      nullable: false,
      role: "metric" as const,
      unit: "%",
      valueType: "number" as const,
    },
  ];
  const seriesReference = {
    byteLength: 120,
    id: "series-a",
    label: "Charge trace",
    mediaType: "application/vnd.setta.series+json",
    path: "artifacts/series-a.json",
    sha256: SHA_B,
  };
  const imageReference = {
    byteLength: 80,
    id: "frame-a",
    label: "Thermal frame",
    mediaType: "image/svg+xml",
    path: "artifacts/frame-a.svg",
    sha256: SHA_C,
  };
  return {
    artifacts: [
      {
        content: {
          kind: "series",
          series: {
            axis: { id: "elapsed", label: "Elapsed time", unit: "s" },
            samples: [
              { values: { temperature: 21 }, x: 0 },
              { values: { temperature: 27 }, x: 5 },
              { values: { temperature: 33 }, x: 10 },
            ],
            schemaVersion: "setta-series/v1",
            series: [{ id: "temperature", label: "Temperature", unit: "°C" }],
          },
        },
        error: null,
        reference: seriesReference,
        status: "resolved",
      },
      {
        content: {
          byteLength: 80,
          inline: true,
          kind: "artifact",
          mediaType: "image/svg+xml",
          route: "/api/v1/artifacts/frame-a",
          sha256: SHA_C,
        },
        error: null,
        reference: imageReference,
        status: "resolved",
      },
    ],
    experiment: {
      artifacts: [seriesReference, imageReference],
      fields,
      id: "test-experiment",
      observations: {
        byteLength: 200,
        path: "data/observations.json",
        sha256: SHA_A,
      },
      presentation: {
        initialViewId: "overview",
        sections: [
          {
            fieldIds: ["chemistry", "cycle"],
            id: "cohort",
            title: "Cohort",
            type: "facets",
          },
          {
            colorFieldId: "chemistry",
            id: "population",
            title: "Population",
            type: "scatter",
            xFieldId: "cycle",
            yFieldId: "retention",
          },
          {
            bins: 10,
            fieldId: "retention",
            id: "distribution",
            title: "Distribution",
            type: "histogram",
          },
          {
            aggregation: "mean",
            id: "heatmap",
            title: "Conditions",
            type: "heatmap",
            valueFieldId: "retention",
            xFieldId: "chemistry",
            yFieldId: "cycle",
          },
          {
            fieldIds: ["cycle", "retention"],
            id: "relationships",
            title: "Relationships",
            type: "parallel",
          },
          {
            fieldIds: ["chemistry", "cycle", "retention"],
            id: "observations",
            title: "Observations",
            type: "table",
          },
          {
            aggregation: "mean",
            fieldIds: ["retention"],
            id: "summary",
            title: "Summary",
            type: "metrics",
          },
          {
            artifactRole: "recorded-series",
            detailFieldIds: ["chemistry", "cycle", "retention"],
            id: "trace",
            title: "Recorded series",
            type: "timeline",
          },
          {
            artifactRoles: ["recorded-frame"],
            id: "evidence",
            title: "Evidence",
            type: "gallery",
          },
        ],
        views: [
          {
            id: "overview",
            name: "Overview",
            placements: [
              { height: 240, sectionId: "cohort", width: 1_200, x: 40, y: 40 },
              {
                height: 260,
                sectionId: "summary",
                width: 1_200,
                x: 40,
                y: 320,
              },
              {
                height: 380,
                sectionId: "population",
                width: 580,
                x: 40,
                y: 620,
              },
              {
                height: 380,
                sectionId: "distribution",
                width: 580,
                x: 660,
                y: 620,
              },
              {
                height: 380,
                sectionId: "heatmap",
                width: 1_200,
                x: 40,
                y: 1_040,
              },
            ],
            viewport: { x: 120, y: 20, zoom: 0.8 },
          },
          {
            id: "compare",
            name: "Compare",
            placements: [
              {
                height: 420,
                sectionId: "relationships",
                width: 1_200,
                x: 40,
                y: 40,
              },
              {
                height: 380,
                sectionId: "observations",
                width: 1_200,
                x: 40,
                y: 500,
              },
            ],
            viewport: { x: 180, y: 30, zoom: 0.75 },
          },
          {
            id: "inspect",
            name: "Inspect",
            placements: [
              {
                height: 300,
                sectionId: "observations",
                width: 1_200,
                x: 40,
                y: 40,
              },
              { height: 380, sectionId: "trace", width: 580, x: 40, y: 380 },
              {
                height: 380,
                sectionId: "evidence",
                width: 580,
                x: 660,
                y: 380,
              },
            ],
            viewport: { x: 180, y: 30, zoom: 0.75 },
          },
        ],
      },
      provenance: {
        createdAt: "2026-09-19T00:00:00Z",
        producer: { kind: "script", name: "test fixture" },
      },
      relations: [
        {
          artifactId: "series-a",
          observationId: "observation-a",
          role: "recorded-series",
          timeline: null,
        },
        {
          artifactId: "frame-a",
          observationId: "observation-a",
          role: "recorded-frame",
          timeline: { axisId: "elapsed", value: 5 },
        },
      ],
      summary: "A compact test experiment.",
      title: "Test experiment",
      version: 1,
    },
    manifestPath: "experiment.json",
    manifestSha256: SHA_B,
    observationSourcePath: "data/observations.json",
    observationSourceSha256: SHA_A,
    observations: [
      {
        id: "observation-a",
        values: { chemistry: "LFP", cycle: 100, retention: 97.2 },
      },
      {
        id: "observation-b",
        values: { chemistry: "LFP", cycle: 200, retention: 94.1 },
      },
      {
        id: "observation-c",
        values: { chemistry: "NMC", cycle: 200, retention: 91.3 },
      },
    ],
    revision: 3,
    selection: {
      filters: [],
      focusedObservationId: "observation-a",
      annotations: [],
      ranges: [],
      selectedArtifactIds: [],
      selectedObservationIds: [],
    },
    version: 1,
  };
}
