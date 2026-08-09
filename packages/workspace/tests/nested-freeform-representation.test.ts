import { describe, expect, it } from "vitest";

import { NESTED_FREEFORM_REPRESENTATION_CANDIDATES } from "../src/testing.js";

describe("Phase 6 nested freeform representation decision", () => {
  it("compares exactly the three plan-mandated candidates and selects one owner", () => {
    expect(NESTED_FREEFORM_REPRESENTATION_CANDIDATES.map(({ id }) => id)).toEqual([
      "all-sections-xyflow",
      "nested-xyflow",
      "recursive-dom",
    ]);
    expect(NESTED_FREEFORM_REPRESENTATION_CANDIDATES.filter(({ selected }) => selected)).toEqual([
      expect.objectContaining({ id: "recursive-dom" }),
    ]);
  });

  it("records one concrete stopping reason for every candidate", () => {
    for (const candidate of NESTED_FREEFORM_REPRESENTATION_CANDIDATES) {
      expect(candidate.reasons).toHaveLength(1);
      expect(candidate.reasons[0]?.trim().length).toBeGreaterThan(0);
    }
    expect(NESTED_FREEFORM_REPRESENTATION_CANDIDATES).toMatchObject([
      { reasons: [expect.stringContaining("siblings")], selected: false },
      { reasons: [expect.stringContaining("viewport and store owner")], selected: false },
      { reasons: [expect.stringContaining("outer XYFlow viewport")], selected: true },
    ]);
  });
});
