import { describe, expect, it } from "vitest";

import { lensTestSnapshot } from "../test/lensTestData";
import { projectLensDocument } from "./lensProjection";

describe("Experiment Lens Workspace projection", () => {
  it("projects one generic six-section catalog with Atlas and Inspect views", () => {
    const document = projectLensDocument(lensTestSnapshot());

    expect(
      Object.values(document.sections).map((section) => section.name),
    ).toEqual([
      "Cohort",
      "Population",
      "Relationships",
      "Observations",
      "Recorded series",
      "Artifact",
    ]);
    expect(Object.keys(document.savedViews?.views ?? {})).toEqual([
      "atlas",
      "inspect",
    ]);
  });

  it("uses a compact initial viewport without changing section geometry", () => {
    const document = projectLensDocument(lensTestSnapshot(), { compact: true });

    expect(document.viewport).toEqual({ x: 40, y: 12, zoom: 0.62 });
    expect(document.savedViews?.views.atlas?.viewport).toEqual({
      x: 40,
      y: 12,
      zoom: 0.62,
    });
    expect(document.savedViews?.views.inspect?.viewport).toEqual({
      x: 40,
      y: 18,
      zoom: 0.62,
    });
    expect(document.topLevelSections["lens:facets"]).toMatchObject({
      w: 1_320,
      x: 64,
    });
  });

  it("omits inapplicable built-ins for a sparse manifest", () => {
    const base = lensTestSnapshot();
    const retention = base.experiment.fields.find(
      (field) => field.id === "retention",
    );
    if (!retention) {
      throw new Error("The test metric is required.");
    }
    const sparse = {
      ...base,
      artifacts: [],
      experiment: {
        ...base.experiment,
        artifacts: [],
        fields: [retention],
        relations: [],
      },
      observations: base.observations.map((observation) => ({
        ...observation,
        values: { retention: observation.values.retention ?? null },
      })),
    };
    const document = projectLensDocument(sparse);

    expect(
      Object.values(document.sections).map((section) => section.name),
    ).toEqual(["Observations"]);
    expect(Object.keys(document.savedViews?.views ?? {})).toEqual(["atlas"]);
    expect(
      Object.keys(document.savedViews?.views.atlas?.topLevelSections ?? {}),
    ).toEqual(["lens:table"]);
    expect(document.topLevelSections["lens:table"]).toMatchObject({
      w: 1_320,
      x: 64,
      y: 64,
    });
  });

  it("expands a lone chart and removes absent row gaps", () => {
    const base = lensTestSnapshot();
    const retention = base.experiment.fields.find(
      (field) => field.id === "retention",
    );
    if (!retention) {
      throw new Error("The test metric is required.");
    }
    const resistance = {
      ...retention,
      id: "resistance",
      label: "Resistance",
      unit: "mΩ",
    };
    const snapshot = {
      ...base,
      artifacts: [],
      experiment: {
        ...base.experiment,
        artifacts: [],
        fields: [retention, resistance],
        relations: [],
      },
      observations: base.observations.map((observation) => ({
        ...observation,
        values: {
          resistance: 20,
          retention: observation.values.retention ?? null,
        },
      })),
    };
    const document = projectLensDocument(snapshot);

    expect(document.topLevelSections["lens:parallel"]).toMatchObject({
      w: 1_320,
      x: 64,
      y: 64,
    });
    expect(document.topLevelSections["lens:table"]?.y).toBe(514);
  });

  it("expands one detail surface and preserves failed evidence visibility", () => {
    const base = lensTestSnapshot();
    const retention = base.experiment.fields.find(
      (field) => field.id === "retention",
    );
    const image = base.artifacts[1];
    if (!retention || !image) {
      throw new Error("The test metric and artifact are required.");
    }
    const snapshot = {
      ...base,
      artifacts: [image],
      experiment: {
        ...base.experiment,
        artifacts: [image.reference],
        fields: [retention],
        relations: base.experiment.relations.filter(
          (relation) => relation.artifactId === image.reference.id,
        ),
      },
      observations: base.observations.map((observation) => ({
        ...observation,
        values: { retention: observation.values.retention ?? null },
      })),
    };
    const document = projectLensDocument(snapshot);
    const inspect = document.savedViews?.views.inspect;

    expect(document.topLevelSections["lens:table"]?.y).toBe(64);
    expect(inspect?.topLevelSections["lens:artifact"]).toMatchObject({
      w: 1_320,
      x: 64,
      y: 444,
    });

    const series = base.artifacts[0];
    if (!series) {
      throw new Error("The test series is required.");
    }
    const failedSeries = {
      ...series,
      content: null,
      error: {
        artifactId: series.reference.id,
        code: "artifact_changed",
        field: null,
        message: "The recorded series changed after admission.",
      },
      status: "failed" as const,
    };
    const failedDocument = projectLensDocument({
      ...snapshot,
      artifacts: [failedSeries],
      experiment: {
        ...snapshot.experiment,
        artifacts: [series.reference],
        relations: base.experiment.relations.filter(
          (relation) => relation.artifactId === series.reference.id,
        ),
      },
    });
    expect(failedDocument.sections["lens:series"]?.name).toBe(
      "Recorded series",
    );
  });
});
