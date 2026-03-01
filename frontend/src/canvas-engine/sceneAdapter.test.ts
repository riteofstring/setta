import type {
  ProjectConfig,
  TopLevelSectionLayout,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  CanvasEngineSceneAdapter,
  type CanvasEngineEdgeHandlePosition,
  type CanvasEngineSectionEdgePorts,
} from "./sceneAdapter";

type SceneInput = {
  topLevelSections: Record<string, TopLevelSectionLayout>;
  activeSectionIds: string[];
  edges: ProjectConfig["edges"];
  agenticEdges: ProjectConfig["agenticEdges"];
  edgeHandlePositions: Record<string, CanvasEngineEdgeHandlePosition>;
  sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>;
};

type SceneInputOverrides = Omit<
  SceneInput,
  "edgeHandlePositions" | "sectionEdgePortsBySectionId"
> & {
  edgeHandlePositions?: Record<string, CanvasEngineEdgeHandlePosition>;
  sectionEdgePortsBySectionId?: Record<string, CanvasEngineSectionEdgePorts>;
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

  it("returns section rectangles by id for host interactions", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 24, y: 48, w: 360, h: 260, zIndex: 1 }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    expect(adapter.getRectById("sectionA")).toMatchObject({
      id: "sectionA",
      x: 24,
      y: 48,
      width: 360,
      height: 260,
      zIndex: 1,
    });
    expect(adapter.getRectById("missing-section")).toBe(null);
  });

  it("queries section ids inside a selection rectangle for partial and full modes", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 200, h: 160, zIndex: 1 }),
          sectionB: createLayout({ x: 260, y: 0, w: 200, h: 160, zIndex: 2 }),
          sectionC: createLayout({ x: 900, y: 0, w: 200, h: 160, zIndex: 3 }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    const selectionRect = { x: 180, y: -20, width: 300, height: 220 };
    expect(adapter.querySectionIdsInWorldRect(selectionRect, true)).toEqual([
      "sectionA",
      "sectionB",
    ]);
    expect(adapter.querySectionIdsInWorldRect(selectionRect, false)).toEqual([
      "sectionB",
    ]);
  });

  it("hit-tests visible edges in world space and prioritizes agentic overlays", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          sectionB: createLayout({ x: 420, y: 0, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-data-visible", "sectionA", "sectionB"),
          createDataEdge("edge-data-hidden", "sectionA", "sectionB", {
            hidden: true,
          }),
        ],
        agenticEdges: [
          createAgenticEdge("edge-agentic-visible", "sectionA", "sectionB"),
        ],
      }),
    );

    expect(adapter.hitTestEdgeAtWorldPoint(370, 100, 8)).toEqual({
      kind: "agentic",
      id: "edge-agentic-visible",
    });
    expect(adapter.hitTestEdgeAtWorldPoint(370, 107, 8)).toEqual({
      kind: "agentic",
      id: "edge-agentic-visible",
    });
    expect(adapter.hitTestEdgeAtWorldPoint(370, 121, 8)).toBe(null);
  });

  it("hit-tests long data-edge segments away from section bounds", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          sectionB: createLayout({ x: 4000, y: 0, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [createDataEdge("edge-data-long", "sectionA", "sectionB")],
        agenticEdges: [],
      }),
    );

    expect(adapter.hitTestEdgeAtWorldPoint(2160, 100, 8)).toEqual({
      kind: "data",
      id: "edge-data-long",
    });
  });

  it("reindexes edge hit testing when section geometry changes", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          sectionB: createLayout({ x: 420, y: 0, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [
          createAgenticEdge("edge-agentic-moving", "sectionA", "sectionB"),
        ],
      }),
    );

    expect(adapter.hitTestEdgeAtWorldPoint(370, 100, 8)).toEqual({
      kind: "agentic",
      id: "edge-agentic-moving",
    });

    const patchSummary = adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          sectionB: createLayout({ x: 920, y: 300, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [
          createAgenticEdge("edge-agentic-moving", "sectionA", "sectionB"),
        ],
      }),
    );

    expect(patchSummary.sectionsUpdated).toBe(1);
    expect(patchSummary.agenticEdgesUpdated).toBe(0);
    expect(adapter.hitTestEdgeAtWorldPoint(620, 250, 8)).toEqual({
      kind: "agentic",
      id: "edge-agentic-moving",
    });
    expect(adapter.hitTestEdgeAtWorldPoint(370, 100, 8)).toBe(null);
  });

  it("hit-tests agentic source and target handles in world space", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 100, y: 40, w: 320, h: 200, zIndex: 1 }),
        },
        activeSectionIds: [],
        edges: [],
        agenticEdges: [],
      }),
    );

    expect(adapter.hitTestAgenticHandleAtWorldPoint(81, 140, 12)).toEqual({
      sectionId: "sectionA",
      handleType: "target",
      handleWorldX: 81,
      handleWorldY: 140,
    });
    expect(adapter.hitTestAgenticHandleAtWorldPoint(439, 140, 12)).toEqual({
      sectionId: "sectionA",
      handleType: "source",
      handleWorldX: 439,
      handleWorldY: 140,
    });
    expect(adapter.hitTestAgenticHandleAtWorldPoint(100, 140, 12)).toBe(null);
  });

  it("hit-tests data handles and edge endpoints using registered port anchors", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 80, y: 80, w: 320, h: 200, zIndex: 1 }),
          sectionB: createLayout({ x: 520, y: 120, w: 320, h: 200, zIndex: 2 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-data-anchored", "sectionA", "sectionB", {
            sourcePortId: "out-1",
            targetPortId: "in-1",
          }),
        ],
        agenticEdges: [],
        edgeHandlePositions: {
          [buildDataHandleKey("sectionA", "out-1", "source")]:
            createEdgeHandlePosition({
              sectionId: "sectionA",
              portId: "out-1",
              type: "source",
              x: 412,
              y: 170,
            }),
          [buildDataHandleKey("sectionB", "in-1", "target")]:
            createEdgeHandlePosition({
              sectionId: "sectionB",
              portId: "in-1",
              type: "target",
              x: 518,
              y: 206,
            }),
        },
      }),
    );

    expect(
      adapter.hitTestDataHandleAtWorldPoint(412, 170, 8, {
        handleType: "source",
      }),
    ).toEqual({
      sectionId: "sectionA",
      portId: "out-1",
      handleType: "source",
      handleWorldX: 412,
      handleWorldY: 170,
    });
    expect(
      adapter.hitTestDataHandleAtWorldPoint(518, 206, 8, {
        handleType: "target",
      }),
    ).toEqual({
      sectionId: "sectionB",
      portId: "in-1",
      handleType: "target",
      handleWorldX: 518,
      handleWorldY: 206,
    });
    expect(adapter.hitTestDataEdgeEndpointAtWorldPoint(412, 170, 8)).toEqual({
      edgeId: "edge-data-anchored",
      endpointType: "source",
    });
    expect(adapter.hitTestDataEdgeEndpointAtWorldPoint(518, 206, 8)).toEqual({
      edgeId: "edge-data-anchored",
      endpointType: "target",
    });
    expect(adapter.hitTestEdgeAtWorldPoint(465, 188, 16)).toEqual({
      kind: "data",
      id: "edge-data-anchored",
    });
  });

  it("hit-tests data handles from estimated section-port anchors when handle registry entries are missing", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 80, y: 80, w: 320, h: 200, zIndex: 1 }),
          sectionB: createLayout({ x: 520, y: 120, w: 320, h: 200, zIndex: 2 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge(
            "edge-data-estimated-handles",
            "sectionA",
            "sectionB",
            {
              sourcePortId: "out-2",
              targetPortId: "in-3",
            },
          ),
        ],
        agenticEdges: [],
        sectionEdgePortsBySectionId: {
          sectionA: {
            inputPortIds: [],
            outputPortIds: ["out-1", "out-2", "out-3"],
          },
          sectionB: {
            inputPortIds: ["in-1", "in-2", "in-3", "in-4"],
            outputPortIds: [],
          },
        },
      }),
    );

    expect(
      adapter.hitTestDataHandleAtWorldPoint(400, 180, 8, {
        handleType: "source",
      }),
    ).toEqual({
      sectionId: "sectionA",
      portId: "out-2",
      handleType: "source",
      handleWorldX: 400,
      handleWorldY: 180,
    });
    expect(
      adapter.hitTestDataHandleAtWorldPoint(520, 240, 8, {
        handleType: "target",
      }),
    ).toEqual({
      sectionId: "sectionB",
      portId: "in-3",
      handleType: "target",
      handleWorldX: 520,
      handleWorldY: 240,
    });
  });

  it("updates data edge anchor coordinates when handle positions move", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          sectionB: createLayout({ x: 420, y: 40, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-data-moving-anchor", "sectionA", "sectionB", {
            sourcePortId: "out-1",
            targetPortId: "in-1",
          }),
        ],
        agenticEdges: [],
        edgeHandlePositions: {
          [buildDataHandleKey("sectionA", "out-1", "source")]:
            createEdgeHandlePosition({
              sectionId: "sectionA",
              portId: "out-1",
              type: "source",
              x: 330,
              y: 120,
            }),
          [buildDataHandleKey("sectionB", "in-1", "target")]:
            createEdgeHandlePosition({
              sectionId: "sectionB",
              portId: "in-1",
              type: "target",
              x: 420,
              y: 140,
            }),
        },
      }),
    );

    expect(adapter.getDataEdgeById("edge-data-moving-anchor")).toMatchObject({
      sourceX: 330,
      sourceY: 120,
      targetX: 420,
      targetY: 140,
    });

    const patchSummary = adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 0, y: 0, w: 320, h: 200 }),
          sectionB: createLayout({ x: 420, y: 40, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-data-moving-anchor", "sectionA", "sectionB", {
            sourcePortId: "out-1",
            targetPortId: "in-1",
          }),
        ],
        agenticEdges: [],
        edgeHandlePositions: {
          [buildDataHandleKey("sectionA", "out-1", "source")]:
            createEdgeHandlePosition({
              sectionId: "sectionA",
              portId: "out-1",
              type: "source",
              x: 336,
              y: 132,
            }),
          [buildDataHandleKey("sectionB", "in-1", "target")]:
            createEdgeHandlePosition({
              sectionId: "sectionB",
              portId: "in-1",
              type: "target",
              x: 420,
              y: 164,
            }),
        },
      }),
    );

    expect(patchSummary.dataEdgesUpdated).toBe(1);
    expect(adapter.getDataEdgeById("edge-data-moving-anchor")).toMatchObject({
      sourceX: 336,
      sourceY: 132,
      targetX: 420,
      targetY: 164,
    });
  });

  it("estimates data edge anchors from section edge-port catalogs without DOM handle positions", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 100, y: 80, w: 300, h: 210 }),
          sectionB: createLayout({ x: 560, y: 140, w: 320, h: 240 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-data-estimated", "sectionA", "sectionB", {
            sourcePortId: "out-2",
            targetPortId: "in-3",
          }),
        ],
        agenticEdges: [],
        sectionEdgePortsBySectionId: {
          sectionA: {
            inputPortIds: [],
            outputPortIds: ["out-1", "out-2", "out-3"],
          },
          sectionB: {
            inputPortIds: ["in-1", "in-2", "in-3", "in-4"],
            outputPortIds: [],
          },
        },
      }),
    );

    expect(adapter.getDataEdgeById("edge-data-estimated")).toMatchObject({
      sourceX: 400,
      sourceY: 185,
      targetX: 560,
      targetY: 284,
    });
    expect(adapter.getDataEdgeAnchorsById("edge-data-estimated")).toEqual({
      startX: 400,
      startY: 185,
      endX: 560,
      endY: 284,
    });
  });

  it("prefers measured handle positions and estimates only missing data-edge anchors", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 100, y: 80, w: 300, h: 210 }),
          sectionB: createLayout({ x: 560, y: 140, w: 320, h: 240 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-data-hybrid", "sectionA", "sectionB", {
            sourcePortId: "out-2",
            targetPortId: "in-3",
          }),
        ],
        agenticEdges: [],
        edgeHandlePositions: {
          [buildDataHandleKey("sectionA", "out-2", "source")]:
            createEdgeHandlePosition({
              sectionId: "sectionA",
              portId: "out-2",
              type: "source",
              x: 405,
              y: 177,
            }),
        },
        sectionEdgePortsBySectionId: {
          sectionA: {
            inputPortIds: [],
            outputPortIds: ["out-1", "out-2", "out-3"],
          },
          sectionB: {
            inputPortIds: ["in-1", "in-2", "in-3", "in-4"],
            outputPortIds: [],
          },
        },
      }),
    );

    expect(adapter.getDataEdgeById("edge-data-hybrid")).toMatchObject({
      sourceX: 405,
      sourceY: 177,
      targetX: 560,
      targetY: 284,
    });
  });

  it("returns resolved data edge anchors by edge id", () => {
    const adapter = new CanvasEngineSceneAdapter();
    adapter.applyProjectState(
      createSceneInput({
        topLevelSections: {
          sectionA: createLayout({ x: 100, y: 120, w: 320, h: 200 }),
          sectionB: createLayout({ x: 560, y: 180, w: 320, h: 200 }),
        },
        activeSectionIds: [],
        edges: [
          createDataEdge("edge-data-anchor-query", "sectionA", "sectionB", {
            sourcePortId: "out-1",
            targetPortId: "in-1",
          }),
        ],
        agenticEdges: [],
        edgeHandlePositions: {
          [buildDataHandleKey("sectionA", "out-1", "source")]:
            createEdgeHandlePosition({
              sectionId: "sectionA",
              portId: "out-1",
              type: "source",
              x: 420,
              y: 210,
            }),
          [buildDataHandleKey("sectionB", "in-1", "target")]:
            createEdgeHandlePosition({
              sectionId: "sectionB",
              portId: "in-1",
              type: "target",
              x: 560,
              y: 280,
            }),
        },
      }),
    );

    expect(adapter.getDataEdgeAnchorsById("edge-data-anchor-query")).toEqual({
      startX: 420,
      startY: 210,
      endX: 560,
      endY: 280,
    });
    expect(adapter.getDataEdgeAnchorsById("missing-edge")).toBe(null);
  });
});

function createSceneInput(overrides: SceneInputOverrides): SceneInput {
  return {
    topLevelSections: overrides.topLevelSections,
    activeSectionIds: overrides.activeSectionIds,
    edges: overrides.edges,
    agenticEdges: overrides.agenticEdges,
    edgeHandlePositions: overrides.edgeHandlePositions ?? {},
    sectionEdgePortsBySectionId: overrides.sectionEdgePortsBySectionId ?? {},
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
  overrides?: Partial<ProjectConfig["edges"][number]>,
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
    ...overrides,
  };
}

function createAgenticEdge(
  id: string,
  sourceSectionId: string,
  targetSectionId: string,
  overrides?: Partial<ProjectConfig["agenticEdges"][number]>,
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
    ...overrides,
  };
}

function buildDataHandleKey(
  sectionId: string,
  portId: string,
  type: "source" | "target",
): string {
  return `${sectionId}:${portId}:${type}`;
}

function createEdgeHandlePosition({
  sectionId,
  portId,
  type,
  x,
  y,
}: {
  sectionId: string;
  portId: string;
  type: "source" | "target";
  x: number;
  y: number;
}): CanvasEngineEdgeHandlePosition {
  return {
    sectionId,
    portId,
    type,
    x,
    y,
  };
}
