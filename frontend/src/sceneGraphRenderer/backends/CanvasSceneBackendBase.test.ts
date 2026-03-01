import { describe, expect, it } from "vitest";
import { CanvasSceneBackendBase } from "./CanvasSceneBackendBase";

describe("CanvasSceneBackendBase resource cache", () => {
  it("applies bounded cache eviction deterministically from snapshot diffs", () => {
    // Enforces bounded section/edge resource caches with deterministic LRU eviction.
    const backend = new TestCanvasBackend({
      sectionCacheCapacity: 2,
      edgeCacheCapacity: 2,
    });

    backend.updateResources(
      createDiff({
        addedSectionIds: ["section-a", "section-b", "section-c"],
        addedEdgeIds: ["edge-a", "edge-b", "edge-c"],
      }),
    );

    const afterInitialFill = backend.getResourceCacheStats();
    expect(afterInitialFill.sectionCacheSize).toBe(2);
    expect(afterInitialFill.edgeCacheSize).toBe(2);
    expect(afterInitialFill.sectionEvictions).toBe(1);
    expect(afterInitialFill.edgeEvictions).toBe(1);
    expect(afterInitialFill.totalEvictions).toBe(2);
    expect(afterInitialFill.pressure).toBe(1);

    backend.updateResources(
      createDiff({
        changedSectionIds: ["section-c"],
        removedSectionIds: ["section-b"],
        changedEdgeIds: ["edge-c"],
        removedEdgeIds: ["edge-b"],
      }),
    );

    const afterRemoval = backend.getResourceCacheStats();
    expect(afterRemoval.sectionCacheSize).toBe(1);
    expect(afterRemoval.edgeCacheSize).toBe(1);
    expect(afterRemoval.sectionEvictions).toBe(1);
    expect(afterRemoval.edgeEvictions).toBe(1);
    expect(afterRemoval.totalEvictions).toBe(2);
    expect(afterRemoval.pressure).toBe(0.5);
  });
});

class TestCanvasBackend extends CanvasSceneBackendBase {
  constructor(cacheConfig: {
    sectionCacheCapacity: number;
    edgeCacheCapacity: number;
  }) {
    super(cacheConfig);
  }

  protected getDebugLabel(): string {
    return "test";
  }
}

function createDiff(
  overrides: Partial<{
    addedSectionIds: string[];
    removedSectionIds: string[];
    changedSectionIds: string[];
    addedEdgeIds: string[];
    removedEdgeIds: string[];
    changedEdgeIds: string[];
    sectionCountDelta: number;
    edgeCountDelta: number;
    isEmpty: boolean;
  }>,
) {
  return {
    addedSectionIds: overrides.addedSectionIds ?? [],
    removedSectionIds: overrides.removedSectionIds ?? [],
    changedSectionIds: overrides.changedSectionIds ?? [],
    addedEdgeIds: overrides.addedEdgeIds ?? [],
    removedEdgeIds: overrides.removedEdgeIds ?? [],
    changedEdgeIds: overrides.changedEdgeIds ?? [],
    sectionCountDelta: overrides.sectionCountDelta ?? 0,
    edgeCountDelta: overrides.edgeCountDelta ?? 0,
    isEmpty: overrides.isEmpty ?? false,
  };
}
