import { describe, expect, it } from "vitest";

import {
  getNextDomIslandRetentionDelayMs,
  resolveDomIslandMountPolicy,
} from "canvas-engine/domIslandMountPolicy";

describe("resolveDomIslandMountPolicy", () => {
  it("keeps visible and active sections mounted while retaining recently offscreen sections", () => {
    const retentionExpiryBySectionId = new Map<string, number>();
    const sectionsWithRects = new Set([
      "visible-1",
      "active-1",
      "offscreen-1",
      "offscreen-2",
    ]);

    const result = resolveDomIslandMountPolicy({
      activeSectionIds: ["active-1"],
      viewportSectionIds: ["visible-1"],
      previousMountedSectionIds: [
        "visible-1",
        "active-1",
        "offscreen-1",
        "offscreen-2",
      ],
      retentionExpiryBySectionId,
      nowMs: 1000,
      retentionMs: 280,
      maxRetainedSections: 10,
      hasRectForSection: (sectionId: string) =>
        sectionsWithRects.has(sectionId),
      sortSectionIds: (sectionIds: string[]) => sectionIds.sort(),
    });

    expect(result.mountedSectionIds).toEqual([
      "active-1",
      "offscreen-1",
      "offscreen-2",
      "visible-1",
    ]);
    expect(result.retainedSectionCount).toBe(2);
    expect(retentionExpiryBySectionId.get("offscreen-1")).toBe(1280);
    expect(retentionExpiryBySectionId.get("offscreen-2")).toBe(1280);
  });

  it("drops expired and stale retained sections", () => {
    const retentionExpiryBySectionId = new Map<string, number>([
      ["expired-1", 900],
      ["future-1", 1300],
      ["stale-1", 1400],
    ]);
    const sectionsWithRects = new Set(["expired-1", "future-1"]);

    const result = resolveDomIslandMountPolicy({
      activeSectionIds: [],
      viewportSectionIds: [],
      previousMountedSectionIds: [],
      retentionExpiryBySectionId,
      nowMs: 1000,
      retentionMs: 280,
      maxRetainedSections: 10,
      hasRectForSection: (sectionId: string) =>
        sectionsWithRects.has(sectionId),
      sortSectionIds: (sectionIds: string[]) => sectionIds.sort(),
    });

    expect(result.mountedSectionIds).toEqual(["future-1"]);
    expect(result.retainedSectionCount).toBe(1);
    expect(retentionExpiryBySectionId.has("expired-1")).toBe(false);
    expect(retentionExpiryBySectionId.has("stale-1")).toBe(false);
  });

  it("caps retained sections by earliest expiry first", () => {
    const retentionExpiryBySectionId = new Map<string, number>([
      ["retain-a", 1100],
      ["retain-b", 1200],
      ["retain-c", 1300],
      ["retain-d", 1400],
    ]);

    const result = resolveDomIslandMountPolicy({
      activeSectionIds: [],
      viewportSectionIds: [],
      previousMountedSectionIds: [],
      retentionExpiryBySectionId,
      nowMs: 1000,
      retentionMs: 280,
      maxRetainedSections: 2,
      hasRectForSection: () => true,
      sortSectionIds: (sectionIds: string[]) => sectionIds.sort(),
    });

    expect(result.mountedSectionIds).toEqual(["retain-c", "retain-d"]);
    expect(result.retainedSectionCount).toBe(2);
    expect(retentionExpiryBySectionId.has("retain-a")).toBe(false);
    expect(retentionExpiryBySectionId.has("retain-b")).toBe(false);
    expect(retentionExpiryBySectionId.has("retain-c")).toBe(true);
    expect(retentionExpiryBySectionId.has("retain-d")).toBe(true);
  });
});

describe("getNextDomIslandRetentionDelayMs", () => {
  it("returns null when there are no retained sections", () => {
    expect(getNextDomIslandRetentionDelayMs(new Map(), 1000)).toBeNull();
  });

  it("returns clamped delay for the next expiry", () => {
    const retentionExpiryBySectionId = new Map<string, number>([
      ["a", 980],
      ["b", 1120],
      ["c", 1250],
    ]);

    expect(
      getNextDomIslandRetentionDelayMs(retentionExpiryBySectionId, 1000),
    ).toBe(0);
    expect(
      getNextDomIslandRetentionDelayMs(retentionExpiryBySectionId, 1100),
    ).toBe(0);
    expect(
      getNextDomIslandRetentionDelayMs(retentionExpiryBySectionId, 900),
    ).toBe(80);
  });
});
