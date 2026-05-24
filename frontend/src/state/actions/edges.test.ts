import { HandlePosition, type Connection } from "gpuFlow/flowTypes";
import {
  registerGpuFlowPortDescriptor,
  unregisterGpuFlowPortDescriptor,
  useGpuFlowPortRegistry,
} from "gpuFlow/ports/portGeometry";
import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import type { GpuFlowScene } from "gpuFlow/scene";
import {
  createEdge,
  deleteEdges,
  reconnectEdge,
  setEdges,
  updateEdge,
} from "openapi/http";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY } from "testUtils/gpuRetainedTextLikePolicy";
import {
  createCore,
  createProjectConfig,
  createVariant,
  type Edge,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEdgeFromConnection,
  deleteSelectedEdges,
  isValidDataEdgeConnection,
  reconnectEdgeFromConnection,
  toggleEdgeSelection,
} from "./edges";
vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    createEdge: vi.fn(),
    updateEdge: vi.fn(),
    deleteEdges: vi.fn(),
    reconnectEdge: vi.fn(),
    setEdges: vi.fn(),
  };
});
const mockedRouteCreateEdge = vi.mocked(createEdge);
const mockedRouteUpdateEdge = vi.mocked(updateEdge);
const mockedRouteDeleteEdges = vi.mocked(deleteEdges);
const mockedRouteReconnectEdge = vi.mocked(reconnectEdge);
const mockedRouteSetEdges = vi.mocked(setEdges);

function createOpenAPIDataResponse<TData>(data: TData): {
  data: TData;
  request: Request;
  response: Response;
} {
  return {
    data,
    request: new Request("http://localhost"),
    response: new Response(null, { status: 200 }),
  };
}

const projectConfigId = "project-1";
const sourceSectionId = "source-section";
const targetSectionId = "target-section";
const sourceVariantId = "source-variant";
const targetVariantId = "target-variant";
const sourcePortId = "result";
const targetPortId = "input";
function seedEdgeState(edges: Array<Edge>) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: projectConfigId,
      edges,
      sectionVariantMap: {
        [sourceSectionId]: sourceVariantId,
        [targetSectionId]: targetVariantId,
      },
    });
    state.sections = {
      [sourceSectionId]: createCore({
        id: sourceSectionId,
        name: "Source",
        variants: [sourceVariantId],
        defaultVariant: sourceVariantId,
      }),
      [targetSectionId]: createCore({
        id: targetSectionId,
        name: "Target",
        variants: [targetVariantId],
        defaultVariant: targetVariantId,
      }),
    };
    state.sectionVariants = {
      [sourceVariantId]: createVariant({
        id: sourceVariantId,
        impl: "source-impl",
        nonPresetImpls: [],
      }),
      [targetVariantId]: createVariant({
        id: targetVariantId,
        impl: "target-impl",
        nonPresetImpls: [],
      }),
    };
    state.previewSectionVariantMap = {};
  });
  registerGpuFlowPortDescriptor({
    localRect: { height: 10, width: 10, x: 5, y: 5 },
    nodeId: sourceSectionId,
    portId: sourcePortId,
    side: HandlePosition.Right,
    type: "source",
  });
  registerGpuFlowPortDescriptor({
    localRect: { height: 10, width: 10, x: 15, y: 15 },
    nodeId: targetSectionId,
    portId: targetPortId,
    side: HandlePosition.Left,
    type: "target",
  });
}
function createConnection(): Connection {
  return {
    source: sourceSectionId,
    target: targetSectionId,
    sourceHandle: sourcePortId,
    targetHandle: targetPortId,
  };
}
function createSceneWithRetainedEdgePorts(): GpuFlowScene {
  const sourceRect = { height: 40, width: 200, x: 20, y: 60 };
  const targetRect = { height: 40, width: 200, x: 100, y: 120 };
  return {
    contentSurfaces: [
      createRetainedPortSurface({
        ownerSectionId: sourceSectionId,
        portId: sourcePortId,
        portKind: "output",
        rect: sourceRect,
      }),
      createRetainedPortSurface({
        ownerSectionId: targetSectionId,
        portId: targetPortId,
        portKind: "input",
        rect: targetRect,
      }),
    ],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}
function createRetainedPortSurface({
  ownerSectionId,
  portId,
  portKind,
  rect,
}: {
  readonly ownerSectionId: string;
  readonly portId: string;
  readonly portKind: "input" | "output";
  readonly rect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
}): GpuFlowScene["contentSurfaces"][number] {
  const surfaceId = `${ownerSectionId}:param-content:unpinned`;
  return {
    clipRect: rect,
    id: surfaceId,
    ownerSectionId,
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId,
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: surfaceId,
      ownerSectionId,
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "",
            displayValue: "",
            editorKind: "text",
            kind: "text-like",
            policy: TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY,
            rendererFamily: "text",
            commitPolicy: "native-island",
          },
          controlKind: "text-like",
          depth: 0,
          id: portId,
          label: portKind === "input" ? "Input" : "Output",
          ports: [
            {
              id: portId,
              kind: portKind,
              side: portKind === "input" ? "left" : "right",
            },
          ],
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}
function createEmptyScene(): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}
describe("edges actions", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
    mockedRouteCreateEdge.mockResolvedValue(createOpenAPIDataResponse(null));
    mockedRouteUpdateEdge.mockResolvedValue(createOpenAPIDataResponse(null));
    mockedRouteDeleteEdges.mockResolvedValue(createOpenAPIDataResponse(null));
    mockedRouteReconnectEdge.mockResolvedValue(createOpenAPIDataResponse(null));
    mockedRouteSetEdges.mockResolvedValue(createOpenAPIDataResponse(null));
  });
  afterEach(() => {
    resetProjectStores();
    useGpuFlowPortRegistry.getState().reset();
  });
  it("posts createEdge with the canonical connection payload", () => {
    seedEdgeState([]);
    createEdgeFromConnection(createConnection());
    expect(mockedRouteCreateEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteCreateEdge).toHaveBeenCalledWith({
      body: {
        projectConfigId,
        sourceSectionId,
        sourceVariantId,
        sourcePortId,
        targetSectionId,
        targetVariantId,
        targetPortId,
        type: "default",
      },
    });
  });
  it("posts reconnectEdge with the canonical connection payload", () => {
    seedEdgeState([]);
    reconnectEdgeFromConnection("edge-1", createConnection());
    expect(mockedRouteReconnectEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteReconnectEdge).toHaveBeenCalledWith({
      body: {
        projectConfigId,
        edgeId: "edge-1",
        sourceSectionId,
        sourceVariantId,
        sourcePortId,
        targetSectionId,
        targetVariantId,
        targetPortId,
      },
    });
  });
  it("persists data-edge mutations when both ports are scene-owned", () => {
    seedEdgeState([]);
    unregisterGpuFlowPortDescriptor(sourceSectionId, sourcePortId, "source");
    unregisterGpuFlowPortDescriptor(targetSectionId, targetPortId, "target");
    const context = { scene: createSceneWithRetainedEdgePorts() };

    createEdgeFromConnection(createConnection(), context);
    reconnectEdgeFromConnection("edge-1", createConnection(), context);

    expect(mockedRouteCreateEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteReconnectEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteCreateEdge.mock.calls[0]?.[0]).toEqual({
      body: expect.objectContaining({
        sourcePortId,
        targetPortId,
      }),
    });
    expect(mockedRouteReconnectEdge.mock.calls[0]?.[0]).toEqual({
      body: expect.objectContaining({
        edgeId: "edge-1",
        sourcePortId,
        targetPortId,
      }),
    });
  });
  it("ignores registered DOM ports when scene context omits them", () => {
    seedEdgeState([]);
    const context = { scene: createEmptyScene() };

    createEdgeFromConnection(createConnection(), context);
    reconnectEdgeFromConnection("edge-1", createConnection(), context);

    expect(mockedRouteCreateEdge).not.toHaveBeenCalled();
    expect(mockedRouteReconnectEdge).not.toHaveBeenCalled();
  });
  it("validates reconnect candidates as data-edge handle pairs", () => {
    expect(isValidDataEdgeConnection(createConnection())).toBe(true);
    expect(
      isValidDataEdgeConnection({
        ...createConnection(),
        sourceHandle: "agentic-edge-source",
      }),
    ).toBe(false);
    expect(
      isValidDataEdgeConnection({
        ...createConnection(),
        targetHandle: "workflow-target",
      }),
    ).toBe(false);
    expect(
      isValidDataEdgeConnection({
        ...createConnection(),
        sourceHandle: "agentic-edge-reverse-start",
      }),
    ).toBe(false);
    expect(
      isValidDataEdgeConnection({
        ...createConnection(),
        targetHandle: "chat-shared-edge-target",
      }),
    ).toBe(false);
    expect(
      isValidDataEdgeConnection({
        ...createConnection(),
        targetHandle: null,
      }),
    ).toBe(false);
  });
  it("does not persist reconnects until the final connection is complete and registered", () => {
    seedEdgeState([]);
    reconnectEdgeFromConnection("edge-1", {
      ...createConnection(),
      targetHandle: null,
    });
    expect(mockedRouteReconnectEdge).not.toHaveBeenCalled();

    reconnectEdgeFromConnection("edge-1", {
      ...createConnection(),
      target: "missing-section",
    });
    expect(mockedRouteReconnectEdge).not.toHaveBeenCalled();

    unregisterGpuFlowPortDescriptor(sourceSectionId, sourcePortId, "source");
    unregisterGpuFlowPortDescriptor(targetSectionId, targetPortId, "target");
    reconnectEdgeFromConnection("edge-1", createConnection());
    expect(mockedRouteReconnectEdge).not.toHaveBeenCalled();
  });
  it("does not persist reconnects in deployment mode", () => {
    seedEdgeState([]);
    useShareSession.setState({ isDeploymentMode: true });

    reconnectEdgeFromConnection("edge-1", createConnection());

    expect(mockedRouteReconnectEdge).not.toHaveBeenCalled();
  });
  it("single-selects an edge and persists the full edge list", () => {
    seedEdgeState([
      {
        id: "edge-a",
        sourceSectionId,
        sourceVariantId,
        sourcePortId,
        targetSectionId,
        targetVariantId,
        targetPortId,
        type: "default",
        selected: false,
      },
      {
        id: "edge-b",
        sourceSectionId,
        sourceVariantId,
        sourcePortId,
        targetSectionId,
        targetVariantId,
        targetPortId,
        type: "default",
        selected: true,
      },
    ]);
    toggleEdgeSelection("edge-a", false);
    const edges = useProjectState.getState().projectConfig.edges;
    expect(edges).toMatchObject([
      { id: "edge-a", selected: true },
      { id: "edge-b", selected: false },
    ]);
    expect(mockedRouteSetEdges).toHaveBeenCalledTimes(1);
    expect(mockedRouteSetEdges.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          projectConfigId,
          frontendOpId: expect.any(String),
          edges: expect.arrayContaining([
            expect.objectContaining({ id: "edge-a", selected: true }),
            expect.objectContaining({ id: "edge-b", selected: false }),
          ]),
        }),
      }),
    );
  });
  it("multi-select toggles a single edge through updateEdge", () => {
    seedEdgeState([
      {
        id: "edge-a",
        sourceSectionId,
        sourceVariantId,
        sourcePortId,
        targetSectionId,
        targetVariantId,
        targetPortId,
        type: "default",
        selected: false,
      },
    ]);
    toggleEdgeSelection("edge-a", true);
    expect(useProjectState.getState().projectConfig.edges?.[0]?.selected).toBe(
      true,
    );
    expect(mockedRouteUpdateEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteUpdateEdge.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          projectConfigId,
          frontendOpId: expect.any(String),
          edge: expect.objectContaining({
            id: "edge-a",
            selected: true,
          }),
        }),
      }),
    );
  });
  it("deletes selected edges through deleteEdges", () => {
    seedEdgeState([
      {
        id: "edge-a",
        sourceSectionId,
        sourceVariantId,
        sourcePortId,
        targetSectionId,
        targetVariantId,
        targetPortId,
        type: "default",
        selected: true,
      },
      {
        id: "edge-b",
        sourceSectionId,
        sourceVariantId,
        sourcePortId,
        targetSectionId,
        targetVariantId,
        targetPortId,
        type: "default",
        selected: false,
      },
    ]);
    const deleted = deleteSelectedEdges();
    expect(deleted).toBe(true);
    expect(useProjectState.getState().projectConfig.edges).toMatchObject([
      { id: "edge-b" },
    ]);
    expect(mockedRouteDeleteEdges).toHaveBeenCalledTimes(1);
    expect(mockedRouteDeleteEdges.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          projectConfigId,
          frontendOpId: expect.any(String),
          edgeIds: ["edge-a"],
        }),
      }),
    );
  });
});
