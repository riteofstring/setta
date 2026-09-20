import { describe, expect, it } from "vitest";

import { lensTestSnapshot } from "../test/lensTestData";
import { projectLensDocument } from "./lensProjection";

describe("Experiment Lens Workspace projection", () => {
  it("projects every declared built-in without inferring sections", () => {
    const document = projectLensDocument(lensTestSnapshot());

    expect(
      Object.values(document.sections).map((section) => [
        section.id,
        section.kind,
        section.name,
      ]),
    ).toEqual([
      ["cohort", "experiment-lens.facets", "Cohort"],
      ["population", "experiment-lens.scatter", "Population"],
      ["distribution", "experiment-lens.histogram", "Distribution"],
      ["heatmap", "experiment-lens.heatmap", "Conditions"],
      ["relationships", "experiment-lens.parallel", "Relationships"],
      ["observations", "experiment-lens.table", "Observations"],
      ["summary", "experiment-lens.metrics", "Summary"],
      ["trace", "experiment-lens.timeline", "Recorded series"],
      ["evidence", "experiment-lens.gallery", "Evidence"],
    ]);
  });

  it("uses manifest view names, initial view, viewport, and exact geometry", () => {
    const document = projectLensDocument(lensTestSnapshot());

    expect(document.savedViews?.activeViewId).toBe("overview");
    expect(Object.keys(document.savedViews?.views ?? {})).toEqual([
      "overview",
      "compare",
      "inspect",
    ]);
    expect(document.viewport).toEqual({ x: 120, y: 20, zoom: 0.8 });
    expect(document.topLevelSections.population).toEqual({
      h: 380,
      w: 580,
      x: 40,
      y: 620,
      zIndex: 2,
    });
    expect(document.savedViews?.views.inspect?.topLevelSections.trace).toEqual({
      h: 380,
      w: 580,
      x: 40,
      y: 380,
      zIndex: 1,
    });
    expect(
      document.savedViews?.views.inspect?.sectionVisibility.population,
    ).toBe(false);
  });

  it("stores only the validated presentation identity in section data", () => {
    const document = projectLensDocument(lensTestSnapshot());

    expect(document.sections.heatmap?.data).toEqual({
      presentationSectionId: "heatmap",
    });
    expect(document.sections.heatmap?.tagColor).toBeNull();
  });
});
