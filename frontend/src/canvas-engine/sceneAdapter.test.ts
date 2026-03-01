import type {
  ProjectConfig,
  TopLevelSectionLayout,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { CanvasEngineSceneAdapter } from "./sceneAdapter";

type SceneInput = {
  topLevelSections: Record<string, TopLevelSectionLayout>;
  activeSectionIds: string[];
  edges: ProjectConfig["edges"];
  agenticEdges: ProjectConfig["agenticEdges"];
};

describe("CanvasEngineSceneAdapter", () => {
  it("applies an initial scene snapshot with section and edge records", () => {
    const adapter = new CanvasEngineSceneAdapter();
    const input = createSceneInput({
      topLevelSections: {
        sectionA: createLayout({ x: 0, y: 0, w: 320, h: 220 }),
        sectionB: createLayout({ x: 420, y: 80, w: 360, h: 200 }),
      },
      activeSectionIds: ["sectionB"],
      edges: [createDataEdge("edge-data-1", "sectionA", "sectionB")],
      agenticEdges: [
        createAgenticEdge("edge-agentic-1", "sectionB", "sectionA"),
      ],
    });

    const patchSummary = adapter.applyProjectState(input);
    expect(patchSummary.sectionsAdded).toBe(2);
    expect(patchSummary.sectionsUpdated).toBe(0);
    expect(patchSummary.sectionsRemoved).toBe(0);
    expect(patchSummary.dataEdgesAdded).toBe(1);
    expect(patchSummary.agenticEdgesAdded).toBe(1);

    const snapshot = adapter.createSnapshot(
      { x: 0, y: 0, zoom: 1 },
      { width: 1200, height: 800, dpr: 1 },
    );
    expect(snapshot.totalRectCount).toBe(2);
    expect(snapshot.visibleRectCount).toBe(2);
    expect(snapshot.visibleDataEdgeCount).toBe(1);
    expect(snapshot.totalDataEdgeCount).toBe(1);
    expect(snapshot.visibleAgenticEdgeCount).toBe(1);
    expect(snapshot.totalAgenticEdgeCount).toBe(1);
    expect(snapshot.snapshot.rects.map((record) => record.id)).toEqual([
      "sectionA",
      "sectionB",
    ]);
  });

  it("reports only targeted section updates when one section changes", () => {
    const adapter = new CanvasEngineSceneAdapter();
    const initialInput = createSceneInput({
      topLevelSections: {
        sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
        sectionB: createLayout({ x: 360, y: 0, w: 320, h: 200 }),
        sectionC: createLayout({ x: 720, y: 0, w: 320, h: 200 }),
      },
      activeSectionIds: [],
      edges: [],
      agenticEdges: [],
    });
    adapter.applyProjectState(initialInput);

    const nextInput = createSceneInput({
      ...initialInput,
      topLevelSections: {
        ...initialInput.topLevelSections,
        sectionB: createLayout({ x: 440, y: 40, w: 320, h: 200 }),
      },
    });
    const patchSummary = adapter.applyProjectState(nextInput);

    expect(patchSummary.sectionsAdded).toBe(0);
    expect(patchSummary.sectionsUpdated).toBe(1);
    expect(patchSummary.sectionsRemoved).toBe(0);
    expect(patchSummary.dataEdgesUpdated).toBe(0);
    expect(patchSummary.agenticEdgesUpdated).toBe(0);

    const snapshot = adapter.createSnapshot(
      { x: 0, y: 0, zoom: 1 },
      { width: 1600, height: 900, dpr: 1 },
    );
    const sectionB = snapshot.snapshot.rects.find(
      (record) => record.id === "sectionB",
    );
    expect(sectionB?.x).toBe(440);
    expect(sectionB?.y).toBe(40);
  });

  it("removes stale section and edge records when they disappear from project state", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          sectionB: createLayout({ x: 420, y: 0, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [createDataEdge("edge-data-1", "sectionA", "sectionB")],
        agenticEdges: [
          createAgenticEdge("edge-agentic-1", "sectionA", "sectionB"),
        ],
      }),
    );

    const patchSummary = adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionB: createLayout({ x: 420, y: 0, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    expect(patchSummary.sectionsRemoved).toBe(1);
    expect(patchSummary.dataEdgesRemoved).toBe(1);
    expect(patchSummary.agenticEdgesRemoved).toBe(1);

    const snapshot = adapter.createSnapshot(
      { x: 0, y: 0, zoom: 1 },
      { width: 1600, height: 900, dpr: 1 },
    );
    expect(snapshot.totalRectCount).toBe(1);
    expect(snapshot.visibleDataEdgeCount).toBe(0);
    expect(snapshot.totalDataEdgeCount).toBe(0);
    expect(snapshot.visibleAgenticEdgeCount).toBe(0);
    expect(snapshot.totalAgenticEdgeCount).toBe(0);
    expect(snapshot.snapshot.rects.map((record) => record.id)).toEqual([
      "sectionB",
    ]);
  });

  it("keeps active offscreen sections mounted in the snapshot interaction window", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          nearSection: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          farSection: createLayout({ x: 5400, y: 1200, w: 320, h: 200 }),
        },
        activeSectionIds: ["farSection"],
        edges: [],
        agenticEdges: [],
      }),
    );

    const snapshot = adapter.createSnapshot(
      { x: 0, y: 0, zoom: 1 },
      { width: 1000, height: 700, dpr: 1 },
    );
    expect(snapshot.totalRectCount).toBe(2);
    expect(snapshot.visibleRectCount).toBe(2);
    expect(snapshot.snapshot.rects.map((record) => record.id).sort()).toEqual([
      "farSection",
      "nearSection",
    ]);
  });

  it("scales incremental patches on large scenes by touching only changed records", () => {
    const adapter = new CanvasEngineSceneAdapter();
    const totalSections = 2000;
    const topLevelSections: Record<string, TopLevelSectionLayout> = {};
    for (let index = 0; index < totalSections; index += 1) {
      topLevelSections[`section-${index}`] = createLayout({
        x: (index % 50) * 360,
        y: Math.floor(index / 50) * 260,
        w: 320,
        h: 200,
      });
    }

    adapter.applyProjectState(
      createSceneInput({
        topLevelSections,
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    const movedSectionId = "section-1337";
    const nextTopLevelSections = {
      ...topLevelSections,
      [movedSectionId]: createLayout({
        x: 7777,
        y: 3333,
        w: 320,
        h: 200,
      }),
    };
    const patchSummary = adapter.applyProjectState(
      createSceneInput({
        topLevelSections: nextTopLevelSections,
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    expect(patchSummary.sectionsAdded).toBe(0);
    expect(patchSummary.sectionsRemoved).toBe(0);
    expect(patchSummary.sectionsUpdated).toBe(1);
  });

  it("culls edge records outside the visible interaction window", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          nearA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          nearB: createLayout({ x: 420, y: 40, w: 320, h: 200 }),
          farA: createLayout({ x: 8000, y: 1200, w: 320, h: 200 }),
          farB: createLayout({ x: 8420, y: 1280, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-visible", "nearA", "nearB"),
          createDataEdge("edge-culled", "farA", "farB"),
        ],
        agenticEdges: [
          createAgenticEdge("agentic-visible", "nearA", "nearB"),
          createAgenticEdge("agentic-culled", "farA", "farB"),
        ],
      }),
    );

    const snapshot = adapter.createSnapshot(
      { x: 0, y: 0, zoom: 1 },
      { width: 1400, height: 900, dpr: 1 },
    );
    expect(snapshot.totalRectCount).toBe(4);
    expect(snapshot.visibleRectCount).toBe(2);
    expect(snapshot.totalDataEdgeCount).toBe(2);
    expect(snapshot.visibleDataEdgeCount).toBe(1);
    expect(snapshot.totalAgenticEdgeCount).toBe(2);
    expect(snapshot.visibleAgenticEdgeCount).toBe(1);
    expect(snapshot.snapshot.dataEdges.map((edge) => edge.id)).toEqual([
      "edge-visible",
    ]);
    expect(snapshot.snapshot.agenticEdges.map((edge) => edge.id)).toEqual([
      "agentic-visible",
    ]);
  });

  it("returns the topmost section for a world-space hit test", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionLow: createLayout({ x: 0, y: 0, w: 320, h: 220, zIndex: 0 }),
          sectionHigh: createLayout({
            x: 40,
            y: 40,
            w: 320,
            h: 220,
            zIndex: 3,
          }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    expect(adapter.hitTestSectionAtWorldPoint(100, 100)).toBe("sectionHigh");
    expect(adapter.hitTestSectionAtWorldPoint(10, 10)).toBe("sectionLow");
  });

  it("uses section id ordering to break equal-z-index hit test ties", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 220, zIndex: 1 }),
          sectionB: createLayout({ x: 0, y: 0, w: 320, h: 220, zIndex: 1 }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    expect(adapter.hitTestSectionAtWorldPoint(160, 110)).toBe("sectionB");
    expect(adapter.hitTestSectionAtWorldPoint(-10, -10)).toBe(null);
  });
});

function createSceneInput(overrides: SceneInput): SceneInput {
  return {
    topLevelSections: overrides.topLevelSections,
    activeSectionIds: overrides.activeSectionIds,
    edges: overrides.edges,
    agenticEdges: overrides.agenticEdges,
  };
}

function createLayout({
  x,
  y,
  w,
  h,
  zIndex,
}: {
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  zIndex?: number;
}): TopLevelSectionLayout {
  return {
    x,
    y,
    zIndex: zIndex ?? 0,
    w,
    h,
  };
}

function createDataEdge(
  id: string,
  sourceSectionId: string,
  targetSectionId: string,
): ProjectConfig["edges"][number] {
  return {
    id,
    sourceSectionId,
    sourceVariantId: `${sourceSectionId}-variant`,
    sourcePortId: `${sourceSectionId}-port`,
    targetSectionId,
    targetVariantId: `${targetSectionId}-variant`,
    targetPortId: `${targetSectionId}-port`,
    type: "default",
    label: null,
    style: null,
    animated: false,
    hidden: false,
    zIndex: 0,
    data: null,
    selected: false,
  };
}

function createAgenticEdge(
  id: string,
  sourceSectionId: string,
  targetSectionId: string,
): ProjectConfig["agenticEdges"][number] {
  return {
    id,
    sourceSectionId,
    targetSectionId,
    kind: "chat_chat",
    contextMode: "reference_only",
    style: null,
    hidden: false,
    zIndex: 0,
    selected: false,
  };
}
