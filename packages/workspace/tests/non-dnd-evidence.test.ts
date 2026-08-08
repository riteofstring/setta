import { describe, expect, it } from "vitest";

import {
  FIXTURE_ATTRIBUTION,
  NON_DND_BROWSER_EVIDENCE,
  NON_DND_FIXTURE_EVIDENCE,
  SOURCE_SNAPSHOT,
} from "./fixtures/interaction-evidence.js";

const expectedAreas = [
  "accents",
  "appearance",
  "chrome",
  "grid",
  "groupOverflow",
  "grouping",
  "locking",
  "minimap",
  "minimizing",
  "naming",
  "placement",
  "scrollIsolation",
  "selection",
  "sizing",
  "snapping",
  "stacking",
  "toolbar",
  "viewportGestures",
] as const;

describe("non-DnD source characterization", () => {
  it("keeps every Phase 0 behavior area tied to the recorded source snapshot", () => {
    expect(SOURCE_SNAPSHOT).toBe("043d3b2e9c69caf99d1246f1408b3ad7194b7864");
    expect(Object.keys(NON_DND_FIXTURE_EVIDENCE).sort()).toEqual([...expectedAreas].sort());

    for (const evidence of Object.values(NON_DND_FIXTURE_EVIDENCE)) {
      expect(evidence.behavior.length).toBeGreaterThan(24);
      expect(evidence.sources.length).toBeGreaterThan(0);
      expect(evidence.sources.every((source) => source.startsWith("frontend/"))).toBe(true);
    }
    expect(FIXTURE_ATTRIBUTION).toContain("no historical source text copied");
  });

  it("records the contracts that intentionally differ from the historical application", () => {
    expect(NON_DND_FIXTURE_EVIDENCE.grid.behavior).toContain("independent of snapping");
    expect(NON_DND_FIXTURE_EVIDENCE.snapping.behavior).toContain("negative coordinates");
    expect(NON_DND_FIXTURE_EVIDENCE.stacking.behavior).toContain("explicit persistent ordering");
    expect(NON_DND_FIXTURE_EVIDENCE.grouping.behavior).toContain("deterministic geometry");
    expect(NON_DND_FIXTURE_EVIDENCE.appearance.behavior).toContain("package-scoped");
    expect(NON_DND_FIXTURE_EVIDENCE.accents.behavior).toContain("one accepted commit");
  });

  it("retains the representative historical browser scenarios as evidence paths", () => {
    expect(NON_DND_BROWSER_EVIDENCE).toHaveLength(11);
    expect(NON_DND_BROWSER_EVIDENCE).toContain(
      "frontend/tests/e2e/sections/section-sizing.spec.ts",
    );
    expect(NON_DND_BROWSER_EVIDENCE).toContain(
      "frontend/tests/e2e/params/params-section-scroll.spec.ts",
    );
    expect(NON_DND_BROWSER_EVIDENCE).toContain(
      "frontend/tests/e2e/editor/section-style-colors.spec.ts",
    );
  });
});
