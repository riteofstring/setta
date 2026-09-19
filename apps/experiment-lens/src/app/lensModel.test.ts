import { describe, expect, it } from "vitest";

import { lensTestSnapshot } from "../test/lensTestData";
import {
  artifactTimeline,
  displayArtifactAtCursor,
  focusObservation,
  nearestSeriesSampleX,
  setInFilter,
  setRangeFilter,
  toggleSelectedObservation,
  visibleObservations,
} from "./lensModel";

describe("Experiment Lens model", () => {
  it("combines categorical and numeric cohort filters without changing the basket", () => {
    const snapshot = lensTestSnapshot();
    const withChemistry = setInFilter(
      snapshot.selection,
      "chemistry",
      ["LFP"],
      ["LFP", "NMC"],
    );
    const selected = toggleSelectedObservation(withChemistry, "observation-c");
    const filtered = setRangeFilter(selected, "cycle", 150, null, {
      maximum: 200,
      minimum: 100,
    });

    expect(
      visibleObservations(snapshot.observations, filtered.filters).map(
        (observation) => observation.id,
      ),
    ).toEqual(["observation-b"]);
    expect(filtered.selectedObservationIds).toEqual(["observation-c"]);
  });

  it("keeps focus separate from explicit comparison selection", () => {
    const snapshot = lensTestSnapshot();
    const focused = focusObservation(snapshot.selection, "observation-b");

    expect(focused.focusedObservationId).toBe("observation-b");
    expect(focused.selectedObservationIds).toEqual([]);
  });

  it("resolves the nearest timed artifact and its declared series axis", () => {
    const snapshot = lensTestSnapshot();
    const artifact = displayArtifactAtCursor(snapshot, "observation-a", 6.5);

    expect(artifact?.reference.id).toBe("frame-a");
    expect(artifactTimeline(snapshot, "observation-a", "frame-a")).toEqual({
      axisId: "elapsed",
      label: "Elapsed time",
      unit: "s",
      value: 5,
    });
  });

  it("snaps a plot coordinate to the nearest recorded sample", () => {
    const artifact = lensTestSnapshot().artifacts[0];
    const samples =
      artifact?.status === "resolved" && artifact.content.kind === "series"
        ? artifact.content.series.samples
        : [];

    expect(nearestSeriesSampleX(samples, 7.6)).toBe(10);
  });
});
