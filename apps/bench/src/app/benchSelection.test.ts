import { describe, expect, it } from "vitest";

import { makeBenchSnapshot } from "../testSnapshot";
import {
  alignedCaseResults,
  defaultComparedRunIds,
  findReviewForRunPair,
  findRun,
} from "./benchSelection";

describe("Bench comparison selection", () => {
  it("chooses completed candidates from the same launch and aligns their cases", () => {
    const snapshot = makeBenchSnapshot();
    const ids = defaultComparedRunIds(snapshot);
    const aligned = alignedCaseResults(
      findRun(snapshot, ids[0]),
      findRun(snapshot, ids[1]),
    );

    expect(ids).toEqual(["run-cover", "run-contain"]);
    expect(aligned).toEqual([
      expect.objectContaining({
        caseId: "sunset-bottle",
        caseName: "Sunset bottle",
        differs: true,
      }),
    ]);
  });

  it("finds an existing review in either run order without changing its orientation", () => {
    const snapshot = makeBenchSnapshot();
    const review = {
      leftRunId: "run-cover",
      note: "Cover keeps the product edge to edge.",
      preferredRunId: "run-cover",
      rightRunId: "run-contain",
      updatedAt: "2026-09-12T18:01:00Z",
      version: 1 as const,
    };
    snapshot.reviews = [review];

    expect(findReviewForRunPair(snapshot, "run-contain", "run-cover")).toBe(
      review,
    );
    expect(review).toMatchObject({
      leftRunId: "run-cover",
      preferredRunId: "run-cover",
      rightRunId: "run-contain",
    });
  });
});
