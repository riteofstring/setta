import type { Node } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import {
  computeSceneGraphDomIslandSectionIds,
  findTopmostSceneOnlySectionAtFlowPosition,
} from "./domIslands";

function createNode(
  overrides: Partial<Node> & Pick<Node, "id" | "position">,
): Node {
  const hasWidth = Object.prototype.hasOwnProperty.call(overrides, "width");
  const hasHeight = Object.prototype.hasOwnProperty.call(overrides, "height");
  return {
    id: overrides.id,
    position: overrides.position,
    width: hasWidth ? overrides.width : 120,
    height: hasHeight ? overrides.height : 80,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? overrides.zIndex ?? 0,
    type: overrides.type,
    style: overrides.style,
  };
}

describe("computeSceneGraphDomIslandSectionIds", () => {
  it("keeps active and focused anchors mounted and expands a deterministic edge ring", () => {
    // Validates radius-based BFS using source-of-truth edge adjacency and variant filtering.
    const nodesById = new Map<string, Node>([
      ["a", createNode({ id: "a", position: { x: 0, y: 0 } })],
      ["b", createNode({ id: "b", position: { x: 200, y: 0 } })],
      ["c", createNode({ id: "c", position: { x: 400, y: 0 } })],
      ["d", createNode({ id: "d", position: { x: 600, y: 0 } })],
      ["e", createNode({ id: "e", position: { x: 800, y: 0 } })],
    ]);

    const domIslandSectionIds = computeSceneGraphDomIslandSectionIds({
      nodesById,
      edges: [
        {
          sourceSectionId: "a",
          targetSectionId: "b",
          sourceVariantId: "va",
          targetVariantId: "vb",
          hidden: false,
        },
        {
          sourceSectionId: "b",
          targetSectionId: "c",
          sourceVariantId: "vb",
          targetVariantId: "vc",
          hidden: false,
        },
        {
          sourceSectionId: "c",
          targetSectionId: "d",
          sourceVariantId: "vc",
          targetVariantId: "vd",
          hidden: false,
        },
        {
          sourceSectionId: "b",
          targetSectionId: "e",
          sourceVariantId: "vb",
          targetVariantId: "wrong",
          hidden: false,
        },
      ],
      sectionVariantMap: {
        a: "va",
        b: "vb",
        c: "vc",
        d: "vd",
        e: "ve",
      },
      activeSectionIds: ["a"],
      focusedSectionId: "d",
      domIslandRadius: 1,
    });

    expect(Array.from(domIslandSectionIds).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("returns only anchors when radius is zero", () => {
    // Ensures radius=0 never prewarms neighbors and ignores missing anchor ids.
    const nodesById = new Map<string, Node>([
      ["a", createNode({ id: "a", position: { x: 0, y: 0 } })],
      ["b", createNode({ id: "b", position: { x: 200, y: 0 } })],
    ]);

    const domIslandSectionIds = computeSceneGraphDomIslandSectionIds({
      nodesById,
      edges: [
        {
          sourceSectionId: "a",
          targetSectionId: "b",
          hidden: false,
        },
      ],
      sectionVariantMap: {},
      activeSectionIds: ["a", "missing"],
      focusedSectionId: null,
      domIslandRadius: 0,
    });

    expect(Array.from(domIslandSectionIds).sort()).toEqual(["a"]);
  });

  it("returns an empty set when no anchor sections are present", () => {
    // Scene-only mode with no active/focused anchor should not mount unrelated DOM islands.
    const domIslandSectionIds = computeSceneGraphDomIslandSectionIds({
      nodesById: new Map<string, Node>([
        ["a", createNode({ id: "a", position: { x: 0, y: 0 } })],
      ]),
      edges: [],
      sectionVariantMap: {},
      activeSectionIds: [],
      focusedSectionId: null,
      domIslandRadius: 3,
    });

    expect(Array.from(domIslandSectionIds)).toEqual([]);
  });
});

describe("findTopmostSceneOnlySectionAtFlowPosition", () => {
  it("returns the highest z-index scene-only section and breaks ties by id", () => {
    // Mirrors draw-order semantics so click promotion targets the topmost visible shell.
    const nodesById = new Map<string, Node>([
      [
        "a",
        createNode({
          id: "a",
          position: { x: 0, y: 0 },
          width: 200,
          height: 200,
          tempZIndex: 2,
        }),
      ],
      [
        "b",
        createNode({
          id: "b",
          position: { x: 0, y: 0 },
          width: 200,
          height: 200,
          tempZIndex: 3,
        }),
      ],
      [
        "c",
        createNode({
          id: "c",
          position: { x: 0, y: 0 },
          width: 200,
          height: 200,
          tempZIndex: 3,
        }),
      ],
    ]);

    const sectionId = findTopmostSceneOnlySectionAtFlowPosition({
      flowX: 100,
      flowY: 100,
      nodesById,
      domIslandSectionIds: new Set(),
    });

    expect(sectionId).toBe("c");
  });

  it("ignores mounted DOM islands and non-renderable sections", () => {
    // Prevents pane-hit promotion from stealing clicks from already-mounted nodes.
    const nodesById = new Map<string, Node>([
      [
        "active-dom",
        createNode({
          id: "active-dom",
          position: { x: 0, y: 0 },
          width: 200,
          height: 200,
          tempZIndex: 10,
        }),
      ],
      [
        "scene-only",
        createNode({
          id: "scene-only",
          position: { x: 20, y: 20 },
          width: 180,
          height: 180,
          tempZIndex: 2,
        }),
      ],
      [
        "missing-size",
        createNode({
          id: "missing-size",
          position: { x: 20, y: 20 },
          width: null,
          height: 180,
          tempZIndex: 11,
        }),
      ],
    ]);

    const sectionId = findTopmostSceneOnlySectionAtFlowPosition({
      flowX: 100,
      flowY: 100,
      nodesById,
      domIslandSectionIds: new Set(["active-dom"]),
    });

    expect(sectionId).toBe("scene-only");
  });
});
