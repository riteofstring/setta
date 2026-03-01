import type { Node } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import {
  buildSceneGraphRenderSnapshot,
  buildSceneGraphRenderSnapshotDiff,
  createEmptySceneGraphRenderSnapshot,
} from "./snapshot";

function createNode(
  overrides: Partial<Node> & Pick<Node, "id" | "position">,
): Node {
  const hasWidth = Object.prototype.hasOwnProperty.call(overrides, "width");
  const hasHeight = Object.prototype.hasOwnProperty.call(overrides, "height");

  return {
    id: overrides.id,
    position: overrides.position,
    width: hasWidth ? overrides.width : 100,
    height: hasHeight ? overrides.height : 80,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? overrides.zIndex ?? 0,
    type: overrides.type,
    style: overrides.style,
  };
}

describe("buildSceneGraphRenderSnapshot", () => {
  it("builds deterministic section and edge snapshots from source-of-truth stores", () => {
    // Validates snapshot extraction is deterministic and filters invalid handles/variants.
    const nodesById = new Map<string, Node>([
      [
        "section-a",
        createNode({
          id: "section-a",
          position: { x: 20, y: 40 },
          width: 140,
          height: 90,
          zIndex: 2,
          tempZIndex: 7,
        }),
      ],
      [
        "section-b",
        createNode({
          id: "section-b",
          position: { x: 240, y: 110 },
          width: 180,
          height: 120,
          zIndex: 1,
          tempZIndex: 4,
        }),
      ],
      [
        "section-c",
        createNode({
          id: "section-c",
          position: { x: 400, y: 220 },
          width: null,
          height: 130,
        }),
      ],
    ]);
    const snapshot = buildSceneGraphRenderSnapshot({
      nodesById,
      edges: [
        {
          id: "edge-valid",
          sourceSectionId: "section-a",
          targetSectionId: "section-b",
          sourcePortId: "out",
          targetPortId: "in",
          sourceVariantId: "va",
          targetVariantId: "vb",
          hidden: false,
          zIndex: 2,
        },
        {
          id: "edge-hidden",
          sourceSectionId: "section-a",
          targetSectionId: "section-b",
          sourcePortId: "out",
          targetPortId: "in",
          sourceVariantId: "va",
          targetVariantId: "vb",
          hidden: true,
          zIndex: 1,
        },
        {
          id: "edge-variant-mismatch",
          sourceSectionId: "section-a",
          targetSectionId: "section-b",
          sourcePortId: "out",
          targetPortId: "in",
          sourceVariantId: "other",
          targetVariantId: "vb",
          hidden: false,
          zIndex: 3,
        },
        {
          id: "edge-missing-handle",
          sourceSectionId: "section-a",
          targetSectionId: "section-b",
          sourcePortId: "missing",
          targetPortId: "in",
          sourceVariantId: "va",
          targetVariantId: "vb",
          hidden: false,
          zIndex: 4,
        },
      ],
      sectionVariantMap: {
        "section-a": "va",
        "section-b": "vb",
      },
      edgeHandlePositions: {
        "section-a:out:source": { x: 160, y: 86 },
        "section-b:in:target": { x: 240, y: 160 },
      },
    });

    expect(snapshot.sections).toEqual([
      {
        id: "section-b",
        x: 240,
        y: 110,
        width: 180,
        height: 120,
        zIndex: 4,
      },
      {
        id: "section-a",
        x: 20,
        y: 40,
        width: 140,
        height: 90,
        zIndex: 7,
      },
    ]);
    expect(snapshot.edges).toEqual([
      {
        id: "edge-valid",
        sourceX: 160,
        sourceY: 86,
        targetX: 240,
        targetY: 160,
        zIndex: 2,
      },
    ]);
  });
});

describe("buildSceneGraphRenderSnapshotDiff", () => {
  it("tracks changed ids and count deltas for incremental resource updates", () => {
    // Ensures updateResources receives deterministic add/remove/change metadata.
    const previousSnapshot = {
      sections: [
        { id: "section-a", x: 0, y: 0, width: 100, height: 80, zIndex: 1 },
      ],
      edges: [
        {
          id: "edge-a",
          sourceX: 10,
          sourceY: 10,
          targetX: 90,
          targetY: 80,
          zIndex: 0,
        },
      ],
    };
    const nextSnapshot = {
      sections: [
        { id: "section-a", x: 4, y: 0, width: 100, height: 80, zIndex: 1 },
        { id: "section-b", x: 20, y: 20, width: 120, height: 100, zIndex: 2 },
      ],
      edges: [
        {
          id: "edge-a",
          sourceX: 10,
          sourceY: 10,
          targetX: 120,
          targetY: 80,
          zIndex: 0,
        },
        {
          id: "edge-b",
          sourceX: 40,
          sourceY: 30,
          targetX: 70,
          targetY: 90,
          zIndex: 1,
        },
      ],
    };

    const diff = buildSceneGraphRenderSnapshotDiff(
      previousSnapshot,
      nextSnapshot,
    );

    expect(diff).toEqual({
      addedSectionIds: ["section-b"],
      removedSectionIds: [],
      changedSectionIds: ["section-a"],
      addedEdgeIds: ["edge-b"],
      removedEdgeIds: [],
      changedEdgeIds: ["edge-a"],
      sectionCountDelta: 1,
      edgeCountDelta: 1,
      isEmpty: false,
    });
  });

  it("returns an empty diff when snapshots are identical", () => {
    // Avoids unnecessary backend update work when no resources changed.
    const snapshot = {
      sections: [
        { id: "section-a", x: 1, y: 2, width: 3, height: 4, zIndex: 5 },
      ],
      edges: [
        {
          id: "edge-a",
          sourceX: 1,
          sourceY: 2,
          targetX: 3,
          targetY: 4,
          zIndex: 5,
        },
      ],
    };
    const diff = buildSceneGraphRenderSnapshotDiff(snapshot, snapshot);

    expect(diff).toEqual({
      addedSectionIds: [],
      removedSectionIds: [],
      changedSectionIds: [],
      addedEdgeIds: [],
      removedEdgeIds: [],
      changedEdgeIds: [],
      sectionCountDelta: 0,
      edgeCountDelta: 0,
      isEmpty: true,
    });
  });

  it("handles empty previous snapshot baselines", () => {
    // First-frame uploads should identify every section/edge as an added resource.
    const nextSnapshot = {
      sections: [
        { id: "section-a", x: 0, y: 0, width: 100, height: 100, zIndex: 0 },
      ],
      edges: [
        {
          id: "edge-a",
          sourceX: 10,
          sourceY: 20,
          targetX: 40,
          targetY: 80,
          zIndex: 0,
        },
      ],
    };
    const diff = buildSceneGraphRenderSnapshotDiff(
      createEmptySceneGraphRenderSnapshot(),
      nextSnapshot,
    );

    expect(diff.addedSectionIds).toEqual(["section-a"]);
    expect(diff.addedEdgeIds).toEqual(["edge-a"]);
    expect(diff.sectionCountDelta).toBe(1);
    expect(diff.edgeCountDelta).toBe(1);
  });
});
