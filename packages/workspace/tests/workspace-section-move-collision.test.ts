import { describe, expect, it } from "vitest";

import { EMPTY_COLLISION_TRACKER_STATE } from "../src/internal/collision-characterization.js";
import {
  createInteractionRect,
  type InteractionRect,
} from "../src/internal/interaction-geometry.js";
import type { SectionMovePlan } from "../src/internal/section-move-planning.js";
import type { SectionHierarchySnapshot } from "../src/internal/selection-planning.js";
import {
  resolveWorkspaceSectionCollision,
  type WorkspaceSectionMoveRegion,
} from "../src/internal/workspace-section-move-collision.js";
import { resolveWorkspaceSectionMoveLayoutPreview } from "../src/internal/workspace-section-move-layout-preview.js";
import { WorkspaceSectionMoveProjection } from "../src/internal/workspace-section-move-projection.js";

function hierarchy(
  childrenByParent: Readonly<Record<string, readonly string[]>>,
  parentByChild: Readonly<Record<string, string | null>>,
): SectionHierarchySnapshot {
  return { childrenByParent, parentByChild, rootPositions: {}, rootSectionIds: [] };
}

function region({
  direction = "ltr",
  gap = 10,
  height = 500,
  orientation = "vertical",
  parentSectionId,
  width = 500,
  x = 0,
  y = 0,
}: Readonly<{
  direction?: "ltr" | "rtl";
  gap?: number;
  height?: number;
  orientation?: "horizontal" | "vertical";
  parentSectionId: string;
  width?: number;
  x?: number;
  y?: number;
}>): WorkspaceSectionMoveRegion {
  return {
    clientRect: createInteractionRect(x, y, width, height),
    direction,
    gap,
    orientation,
    parentSectionId,
    workspaceRect: { height, width, x, y },
  };
}

function collision({
  activeRect,
  clientRectsById,
  currentHierarchy,
  currentRegions,
  pointer = null,
  previousState = EMPTY_COLLISION_TRACKER_STATE,
  sectionIds = ["moving"],
}: Readonly<{
  activeRect: InteractionRect;
  clientRectsById: Readonly<Record<string, InteractionRect>>;
  currentHierarchy: SectionHierarchySnapshot;
  currentRegions: readonly WorkspaceSectionMoveRegion[];
  pointer?: Readonly<{ x: number; y: number }> | null;
  previousState?: typeof EMPTY_COLLISION_TRACKER_STATE;
  sectionIds?: readonly string[];
}>) {
  return resolveWorkspaceSectionCollision({
    activeRect,
    clientRectsById,
    hierarchy: currentHierarchy,
    mode: "free",
    pointer,
    previousState,
    regions: currentRegions,
    sectionIds,
    sourceParentId: "root",
  });
}

describe("workspace section collision planning", () => {
  it("uses the combined selected-block shape and excludes every moving root", () => {
    const currentHierarchy = hierarchy(
      { root: ["moving-a", "moving-b", "target"] },
      { "moving-a": "root", "moving-b": "root", root: null, target: "root" },
    );
    const result = collision({
      activeRect: createInteractionRect(0, 75, 100, 90),
      clientRectsById: {
        "moving-a": createInteractionRect(0, 0, 100, 40),
        "moving-b": createInteractionRect(0, 50, 100, 40),
        target: createInteractionRect(0, 120, 100, 40),
      },
      currentHierarchy,
      currentRegions: [region({ parentSectionId: "root" })],
      pointer: { x: 50, y: 85 },
      sectionIds: ["moving-a", "moving-b"],
    });

    expect(result.target).toMatchObject({
      destinationParentId: "root",
      targetSectionId: "target",
    });
    expect(result.collisionState.targetId).not.toContain("moving-a");
    expect(result.collisionState.targetId).not.toContain("moving-b");
  });

  it("retains the previous target within the characterized overlap tolerance", () => {
    const currentHierarchy = hierarchy(
      { root: ["moving", "previous", "challenger"] },
      { challenger: "root", moving: "root", previous: "root", root: null },
    );
    const first = collision({
      activeRect: createInteractionRect(0, 0, 105, 100),
      clientRectsById: {
        challenger: createInteractionRect(200, 0, 105, 100),
        moving: createInteractionRect(0, 120, 20, 20),
        previous: createInteractionRect(0, 0, 100, 100),
      },
      currentHierarchy,
      currentRegions: [region({ parentSectionId: "root" })],
    });
    const retained = collision({
      activeRect: createInteractionRect(0, 0, 105, 100),
      clientRectsById: {
        challenger: createInteractionRect(0, 0, 105, 100),
        moving: createInteractionRect(0, 120, 20, 20),
        previous: createInteractionRect(0, 0, 100, 100),
      },
      currentHierarchy,
      currentRegions: [region({ parentSectionId: "root" })],
      previousState: first.collisionState,
    });

    expect(first.target?.targetSectionId).toBe("previous");
    expect(retained.target?.targetSectionId).toBe("previous");
  });

  it("retains the old target rectangle while feedback geometry changes", () => {
    const currentHierarchy = hierarchy(
      { root: ["moving", "target"] },
      { moving: "root", root: null, target: "root" },
    );
    const initial = collision({
      activeRect: createInteractionRect(0, 130, 20, 20),
      clientRectsById: {
        moving: createInteractionRect(0, 0, 20, 20),
        target: createInteractionRect(0, 100, 100, 100),
      },
      currentHierarchy,
      currentRegions: [region({ parentSectionId: "root" })],
      pointer: { x: 10, y: 140 },
    });
    const crossed = collision({
      activeRect: createInteractionRect(0, 141, 20, 20),
      clientRectsById: {
        moving: createInteractionRect(0, 0, 20, 20),
        target: createInteractionRect(0, 130, 100, 240),
      },
      currentHierarchy,
      currentRegions: [region({ parentSectionId: "root" })],
      pointer: { x: 10, y: 151 },
      previousState: initial.collisionState,
    });

    expect(initial.target?.destinationIndex).toBe(0);
    expect(crossed.target?.destinationIndex).toBe(1);
  });

  it("promotes a colliding child above its containing parent", () => {
    const currentHierarchy = hierarchy(
      { container: ["deep"], root: ["moving", "container"] },
      { container: "root", deep: "container", moving: "root", root: null },
    );
    const result = collision({
      activeRect: createInteractionRect(40, 40, 80, 80),
      clientRectsById: {
        container: createInteractionRect(0, 0, 240, 240),
        deep: createInteractionRect(0, 0, 60, 60),
        moving: createInteractionRect(300, 0, 80, 80),
      },
      currentHierarchy,
      currentRegions: [
        region({ height: 260, parentSectionId: "root", width: 260 }),
        region({ height: 200, parentSectionId: "container", width: 200 }),
      ],
    });

    expect(result.target).toMatchObject({
      destinationParentId: "container",
      targetSectionId: "deep",
    });
  });

  it("clears stale targets after leaving every measured region", () => {
    const currentHierarchy = hierarchy(
      { root: ["moving", "target"] },
      { moving: "root", root: null, target: "root" },
    );
    const first = collision({
      activeRect: createInteractionRect(0, 0, 40, 40),
      clientRectsById: {
        moving: createInteractionRect(100, 100, 40, 40),
        target: createInteractionRect(0, 0, 40, 40),
      },
      currentHierarchy,
      currentRegions: [region({ parentSectionId: "root" })],
    });
    const cleared = collision({
      activeRect: createInteractionRect(800, 800, 40, 40),
      clientRectsById: {
        moving: createInteractionRect(100, 100, 40, 40),
        target: createInteractionRect(0, 0, 40, 40),
      },
      currentHierarchy,
      currentRegions: [region({ parentSectionId: "root" })],
      previousState: first.collisionState,
    });

    expect(first.target?.targetSectionId).toBe("target");
    expect(cleared.target).toBeNull();
    expect(cleared.collisionState.targetId).toBeNull();
    expect(cleared.collisionState.targetRect).toBeNull();
  });

  it("uses logical midpoint hysteresis in right-to-left horizontal regions", () => {
    const currentHierarchy = hierarchy(
      { root: ["moving", "target"] },
      { moving: "root", root: null, target: "root" },
    );
    const currentRegion = region({
      direction: "rtl",
      orientation: "horizontal",
      parentSectionId: "root",
    });
    const initial = collision({
      activeRect: createInteractionRect(150, 0, 20, 100),
      clientRectsById: {
        moving: createInteractionRect(300, 0, 20, 100),
        target: createInteractionRect(100, 0, 100, 100),
      },
      currentHierarchy,
      currentRegions: [currentRegion],
      pointer: { x: 160, y: 50 },
    });
    const crossed = collision({
      activeRect: createInteractionRect(130, 0, 20, 100),
      clientRectsById: {
        moving: createInteractionRect(300, 0, 20, 100),
        target: createInteractionRect(100, 0, 100, 100),
      },
      currentHierarchy,
      currentRegions: [currentRegion],
      pointer: { x: 140, y: 50 },
      previousState: initial.collisionState,
    });

    expect(initial.target?.destinationIndex).toBe(0);
    expect(crossed.target?.destinationIndex).toBe(1);
  });

  it.each([0.5, 1, 2])(
    "keeps directionally ranked collision outcomes invariant at %sx zoom",
    (zoom) => {
      const scaled = (x: number, y: number, width: number, height: number) =>
        createInteractionRect(x * zoom, y * zoom, width * zoom, height * zoom);
      const currentHierarchy = hierarchy(
        { root: ["moving", "near", "pre-trigger"] },
        { moving: "root", near: "root", "pre-trigger": "root", root: null },
      );
      const result = collision({
        activeRect: scaled(20, 20, 100, 100),
        clientRectsById: {
          "pre-trigger": scaled(80, 20, 100, 100),
          moving: scaled(300, 300, 100, 100),
          near: scaled(10, 20, 100, 100),
        },
        currentHierarchy,
        currentRegions: [
          region({ height: 500 * zoom, parentSectionId: "root", width: 500 * zoom }),
        ],
      });

      expect(result.target?.targetSectionId).toBe("pre-trigger");
    },
  );
});

function previewPlan(overrides: Partial<SectionMovePlan> = {}): SectionMovePlan {
  return {
    destinationIndex: 1,
    destinationParentId: "root",
    mode: "sort",
    sectionIds: ["a"],
    sourceParentIds: ["root"],
    topLevelPositions: null,
    ...overrides,
  };
}

describe("workspace section layout-stable preview", () => {
  it("matches the characterized vertical transform preview without changing input order", () => {
    const currentHierarchy = hierarchy(
      { root: ["a", "b", "c"] },
      { a: "root", b: "root", c: "root", root: null },
    );
    const before = structuredClone(currentHierarchy);
    const result = resolveWorkspaceSectionMoveLayoutPreview({
      hierarchy: currentHierarchy,
      plan: previewPlan(),
      rectsById: {
        a: { height: 10, width: 100, x: 0, y: 0 },
        b: { height: 10, width: 100, x: 0, y: 20 },
        c: { height: 10, width: 100, x: 0, y: 40 },
      },
      regions: [region({ parentSectionId: "root" })],
    });

    expect(result).toEqual({
      allowed: true,
      preview: { transformsById: { a: { x: 0, y: 20 }, b: { x: 0, y: -20 } } },
    });
    expect(currentHierarchy).toEqual(before);
  });

  it("translates horizontal previews along the physical right-to-left axis", () => {
    const result = resolveWorkspaceSectionMoveLayoutPreview({
      hierarchy: hierarchy(
        { root: ["a", "b", "c"] },
        { a: "root", b: "root", c: "root", root: null },
      ),
      plan: previewPlan(),
      rectsById: {
        a: { height: 100, width: 10, x: 40, y: 0 },
        b: { height: 100, width: 10, x: 20, y: 0 },
        c: { height: 100, width: 10, x: 0, y: 0 },
      },
      regions: [region({ direction: "rtl", orientation: "horizontal", parentSectionId: "root" })],
    });

    expect(result).toEqual({
      allowed: true,
      preview: { transformsById: { a: { x: -20, y: 0 }, b: { x: 20, y: 0 } } },
    });
  });

  it("retains prototype-mutator IDs in layout and imperative frame projections", () => {
    const result = resolveWorkspaceSectionMoveLayoutPreview({
      hierarchy: hierarchy(
        { root: ["__proto__", "b"] },
        Object.fromEntries([
          ["__proto__", "root"],
          ["b", "root"],
          ["root", null],
        ]),
      ),
      plan: previewPlan({ sectionIds: ["__proto__"] }),
      rectsById: Object.fromEntries([
        ["__proto__", { height: 10, width: 100, x: 0, y: 0 }],
        ["b", { height: 10, width: 100, x: 0, y: 20 }],
      ]),
      regions: [region({ parentSectionId: "root" })],
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error("Expected a prototype-mutator layout preview.");
    }
    expect(Object.hasOwn(result.preview.transformsById, "__proto__")).toBe(true);
    expect(result.preview.transformsById["__proto__"]).toEqual({ x: 0, y: 20 });

    const attributes = new Map<string, string>();
    const properties = new Map<string, string>();
    const element = {
      removeAttribute: (name: string) => attributes.delete(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      style: {
        removeProperty: (name: string) => properties.delete(name),
        setProperty: (name: string, value: string) => properties.set(name, value),
      },
    } as unknown as HTMLElement;
    const projection = new WorkspaceSectionMoveProjection();
    projection.register("__proto__", element);
    expect(attributes.has("data-workspace-section-move-preview-transform")).toBe(false);

    projection.preview(Object.fromEntries([["__proto__", { x: 4, y: 8 }]]));
    expect(attributes.get("data-workspace-section-move-preview-transform")).toBe("4,8");
    expect(properties.get("--setta-workspace-section-move-preview-x")).toBe("4px");
    projection.preview({});
    expect(attributes.has("data-workspace-section-move-preview-transform")).toBe(false);
  });

  it("closes the source and opens the destination for a cross-parent sibling block", () => {
    const result = resolveWorkspaceSectionMoveLayoutPreview({
      hierarchy: hierarchy(
        { destination: ["d", "e"], source: ["a", "b", "c"] },
        {
          a: "source",
          b: "source",
          c: "source",
          d: "destination",
          destination: null,
          e: "destination",
          source: null,
        },
      ),
      plan: previewPlan({
        destinationParentId: "destination",
        mode: "free",
        sectionIds: ["a", "b"],
        sourceParentIds: ["source", "source"],
      }),
      rectsById: {
        a: { height: 10, width: 100, x: 0, y: 0 },
        b: { height: 10, width: 100, x: 0, y: 20 },
        c: { height: 10, width: 100, x: 0, y: 40 },
        d: { height: 10, width: 100, x: 200, y: 100 },
        e: { height: 10, width: 100, x: 200, y: 120 },
      },
      regions: [
        region({ parentSectionId: "source" }),
        region({ parentSectionId: "destination", x: 200, y: 100 }),
      ],
    });

    expect(result).toEqual({
      allowed: true,
      preview: { transformsById: { c: { x: 0, y: -40 }, e: { x: 0, y: 40 } } },
    });
  });

  it("closes every mixed source layout before opening one destination", () => {
    const result = resolveWorkspaceSectionMoveLayoutPreview({
      hierarchy: hierarchy(
        { destination: ["d", "e"], "source-a": ["a", "x"], "source-b": ["b", "y"] },
        {
          a: "source-a",
          b: "source-b",
          d: "destination",
          destination: null,
          e: "destination",
          "source-a": null,
          "source-b": null,
          x: "source-a",
          y: "source-b",
        },
      ),
      plan: previewPlan({
        destinationParentId: "destination",
        mode: "free",
        sectionIds: ["a", "b"],
        sourceParentIds: ["source-a", "source-b"],
      }),
      rectsById: {
        a: { height: 10, width: 100, x: 0, y: 0 },
        b: { height: 10, width: 100, x: 120, y: 0 },
        d: { height: 10, width: 100, x: 240, y: 0 },
        e: { height: 10, width: 100, x: 240, y: 20 },
        x: { height: 10, width: 100, x: 0, y: 20 },
        y: { height: 10, width: 100, x: 120, y: 20 },
      },
      regions: [
        region({ parentSectionId: "source-a" }),
        region({ parentSectionId: "source-b", x: 120 }),
        region({ parentSectionId: "destination", x: 240 }),
      ],
    });

    expect(result).toEqual({
      allowed: true,
      preview: {
        transformsById: {
          e: { x: 0, y: 40 },
          x: { x: 0, y: -20 },
          y: { x: 0, y: -20 },
        },
      },
    });
  });

  it("fails specifically when a constrained layout is not completely measured", () => {
    const result = resolveWorkspaceSectionMoveLayoutPreview({
      hierarchy: hierarchy({ root: ["a", "b"] }, { a: "root", b: "root", root: null }),
      plan: previewPlan(),
      rectsById: { a: { height: 10, width: 100, x: 0, y: 0 } },
      regions: [region({ parentSectionId: "root" })],
    });

    expect(result).toEqual({
      allowed: false,
      reason: "The root layout preview is not completely measured.",
    });
  });
});
