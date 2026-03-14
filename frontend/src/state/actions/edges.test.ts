import type { Connection } from "forks/xyflow/core/types";
import {
  useEdgeHandleRegistry,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  route_create_edge,
  route_delete_edges,
  route_reconnect_edge,
  route_set_edges,
  route_update_edge,
} from "utils/generatedEndpoints";
import {
  createCore,
  createProjectConfig,
  createVariant,
  type Edge,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEdgeHandleKey } from "./edgeHandles";
import {
  createEdgeFromConnection,
  deleteSelectedEdges,
  reconnectEdgeFromConnection,
  toggleEdgeSelection,
} from "./edges";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_create_edge: vi.fn(),
    route_update_edge: vi.fn(),
    route_delete_edges: vi.fn(),
    route_reconnect_edge: vi.fn(),
    route_set_edges: vi.fn(),
  };
});

const mockedRouteCreateEdge = vi.mocked(route_create_edge);
const mockedRouteUpdateEdge = vi.mocked(route_update_edge);
const mockedRouteDeleteEdges = vi.mocked(route_delete_edges);
const mockedRouteReconnectEdge = vi.mocked(route_reconnect_edge);
const mockedRouteSetEdges = vi.mocked(route_set_edges);

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

  const sourceKey = makeEdgeHandleKey(sourceSectionId, sourcePortId, "source");
  const targetKey = makeEdgeHandleKey(targetSectionId, targetPortId, "target");
  useEdgeHandleRegistry.setState({
    handles: {},
    positions: {
      [sourceKey]: {
        sectionId: sourceSectionId,
        portId: sourcePortId,
        type: "source",
        side: "right",
        x: 10,
        y: 10,
      },
      [targetKey]: {
        sectionId: targetSectionId,
        portId: targetPortId,
        type: "target",
        side: "left",
        x: 20,
        y: 20,
      },
    },
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

describe("edges actions", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
    mockedRouteCreateEdge.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    mockedRouteUpdateEdge.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    mockedRouteDeleteEdges.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    mockedRouteReconnectEdge.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
    mockedRouteSetEdges.mockResolvedValue({
      data: null,
      status: 200,
      hasResponse: true,
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("posts createEdge with the canonical connection payload", () => {
    seedEdgeState([]);

    createEdgeFromConnection(createConnection());

    expect(mockedRouteCreateEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteCreateEdge).toHaveBeenCalledWith({
      projectConfigId,
      sourceSectionId,
      sourceVariantId,
      sourcePortId,
      targetSectionId,
      targetVariantId,
      targetPortId,
      type: "default",
    });
  });

  it("posts reconnectEdge with the canonical connection payload", () => {
    seedEdgeState([]);

    reconnectEdgeFromConnection("edge-1", createConnection());

    expect(mockedRouteReconnectEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteReconnectEdge).toHaveBeenCalledWith({
      projectConfigId,
      edgeId: "edge-1",
      sourceSectionId,
      sourceVariantId,
      sourcePortId,
      targetSectionId,
      targetVariantId,
      targetPortId,
    });
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
        projectConfigId,
        frontendOpId: expect.any(String),
        edges: expect.arrayContaining([
          expect.objectContaining({ id: "edge-a", selected: true }),
          expect.objectContaining({ id: "edge-b", selected: false }),
        ]),
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

    expect(useProjectState.getState().projectConfig.edges[0]?.selected).toBe(
      true,
    );
    expect(mockedRouteUpdateEdge).toHaveBeenCalledTimes(1);
    expect(mockedRouteUpdateEdge.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        projectConfigId,
        frontendOpId: expect.any(String),
        edge: expect.objectContaining({
          id: "edge-a",
          selected: true,
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
        projectConfigId,
        frontendOpId: expect.any(String),
        edgeIds: ["edge-a"],
      }),
    );
  });
});
