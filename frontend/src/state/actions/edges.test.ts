import {
  createEdgeFromConnection,
  reconnectEdgeFromConnection,
} from "state/actions/edges";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import {
  useEdgeHandleRegistry,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_create_edge: vi.fn(),
    route_reconnect_edge: vi.fn(),
  };
});

const projectConfigId = "project-a";
const sourceSectionId = "section-source";
const targetSectionId = "section-target";
const sourceVariantId = "variant-source";
const targetVariantId = "variant-target";
const sourcePortId = "out-a";
const targetPortId = "in-b";

function seedProjectState() {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.projectConfig.sectionVariantMap = {
      [sourceSectionId]: sourceVariantId,
      [targetSectionId]: targetVariantId,
    };
  });
  useShareSession.setState({ isDeploymentMode: false });
}

describe("edge actions with cached handle positions", () => {
  beforeEach(() => {
    resetProjectStores();
    seedProjectState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("creates data edges from cached handle positions when live handles are gone", async () => {
    const route_create_edge = (await import("utils/generatedEndpoints"))
      .route_create_edge as unknown as vi.Mock;
    route_create_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });

    useEdgeHandleRegistry.setState((state) => {
      state.positions = {};
      state.cachedPositions = {
        [makeEdgeHandleKey(sourceSectionId, sourcePortId, "source")]: {
          sectionId: sourceSectionId,
          portId: sourcePortId,
          type: "source",
          side: "right",
          x: 120,
          y: 160,
        },
        [makeEdgeHandleKey(targetSectionId, targetPortId, "target")]: {
          sectionId: targetSectionId,
          portId: targetPortId,
          type: "target",
          side: "left",
          x: 360,
          y: 160,
        },
      };
    });

    // The DOM handles are gone, but the cached canvas-engine handles should
    // still allow a valid connection to be persisted.
    createEdgeFromConnection({
      source: sourceSectionId,
      sourceHandle: sourcePortId,
      target: targetSectionId,
      targetHandle: targetPortId,
    });

    expect(route_create_edge).toHaveBeenCalledOnce();
    expect(route_create_edge).toHaveBeenCalledWith({
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

  it("reconnects data edges from cached handle positions when live handles are gone", async () => {
    const route_reconnect_edge = (await import("utils/generatedEndpoints"))
      .route_reconnect_edge as unknown as vi.Mock;
    route_reconnect_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: undefined,
    });

    useEdgeHandleRegistry.setState((state) => {
      state.positions = {};
      state.cachedPositions = {
        [makeEdgeHandleKey(sourceSectionId, sourcePortId, "source")]: {
          sectionId: sourceSectionId,
          portId: sourcePortId,
          type: "source",
          side: "right",
          x: 120,
          y: 160,
        },
        [makeEdgeHandleKey(targetSectionId, targetPortId, "target")]: {
          sectionId: targetSectionId,
          portId: targetPortId,
          type: "target",
          side: "left",
          x: 360,
          y: 160,
        },
      };
    });

    // Reconnect validation should use the same cached handle source of truth as
    // create, otherwise cached nested edge reconnects silently fail.
    reconnectEdgeFromConnection("edge-data-1", {
      source: sourceSectionId,
      sourceHandle: sourcePortId,
      target: targetSectionId,
      targetHandle: targetPortId,
    });

    expect(route_reconnect_edge).toHaveBeenCalledOnce();
    expect(route_reconnect_edge).toHaveBeenCalledWith({
      projectConfigId,
      edgeId: "edge-data-1",
      sourceSectionId,
      sourceVariantId,
      sourcePortId,
      targetSectionId,
      targetVariantId,
      targetPortId,
    });
  });
});
