import { STATE_MACHINE_EDGE_HANDLE_IDS } from "state/actions/stateMachineEdgeConnections";
import {
  deleteSelectedStateMachineEdges,
  replaceStateMachineEdge,
  toggleStateMachineEdgeSelection,
} from "state/actions/stateMachineEdgeMutations";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_delete_state_machine_edges: vi.fn(),
    route_set_state_machine_edges: vi.fn(),
    route_update_state_machine_edge: vi.fn(),
  };
});

const projectConfigId = "project-1";

function createWorkflowEdge(id: string, selected = false) {
  return {
    id,
    machineGroupId: "workflow-main",
    sourceSectionId: `source-${id}`,
    sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    targetSectionId: `target-${id}`,
    targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
    sourceFilter: null,
    sourceActivationCountCondition: null,
    targetAction: null,
    style: null,
    hidden: false,
    zIndex: 0,
    selected,
  };
}

function seedWorkflowEdges() {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: projectConfigId,
      stateMachineEdges: [
        createWorkflowEdge("edge-a"),
        createWorkflowEdge("edge-b", true),
      ],
    });
  });
}

describe("stateMachineEdgeMutations", () => {
  beforeEach(() => {
    resetProjectStores();
    seedWorkflowEdges();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("sets a single selected workflow edge and clears the rest", async () => {
    const route_set_state_machine_edges = (
      await import("utils/generatedEndpoints")
    ).route_set_state_machine_edges as unknown as vi.Mock;
    route_set_state_machine_edges.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    toggleStateMachineEdgeSelection("edge-a", false);

    expect(useProjectState.getState().projectConfig.stateMachineEdges).toEqual([
      expect.objectContaining({
        id: "edge-a",
        selected: true,
      }),
      expect.objectContaining({
        id: "edge-b",
        selected: false,
      }),
    ]);
    expect(route_set_state_machine_edges).toHaveBeenCalledTimes(1);
  });

  it("toggles a single workflow edge in multi-select mode", async () => {
    const route_update_state_machine_edge = (
      await import("utils/generatedEndpoints")
    ).route_update_state_machine_edge as unknown as vi.Mock;
    route_update_state_machine_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    toggleStateMachineEdgeSelection("edge-a", true);

    expect(useProjectState.getState().projectConfig.stateMachineEdges).toEqual([
      expect.objectContaining({
        id: "edge-a",
        selected: true,
      }),
      expect.objectContaining({
        id: "edge-b",
        selected: true,
      }),
    ]);
    expect(route_update_state_machine_edge).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId,
        edge: expect.objectContaining({
          id: "edge-a",
          selected: true,
        }),
      }),
    );
  });

  it("deletes only selected workflow edges", async () => {
    const route_delete_state_machine_edges = (
      await import("utils/generatedEndpoints")
    ).route_delete_state_machine_edges as unknown as vi.Mock;
    route_delete_state_machine_edges.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    const didDelete = deleteSelectedStateMachineEdges();

    expect(didDelete).toBe(true);
    expect(useProjectState.getState().projectConfig.stateMachineEdges).toEqual([
      expect.objectContaining({
        id: "edge-a",
      }),
    ]);
    expect(route_delete_state_machine_edges).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId,
        edgeIds: ["edge-b"],
      }),
    );
  });

  it("replaces an existing workflow edge in place", async () => {
    const route_update_state_machine_edge = (
      await import("utils/generatedEndpoints")
    ).route_update_state_machine_edge as unknown as vi.Mock;
    route_update_state_machine_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    replaceStateMachineEdge({
      ...createWorkflowEdge("edge-a"),
      hidden: true,
      zIndex: 7,
    });

    expect(useProjectState.getState().projectConfig.stateMachineEdges).toEqual([
      expect.objectContaining({
        id: "edge-a",
        hidden: true,
        zIndex: 7,
      }),
      expect.objectContaining({
        id: "edge-b",
      }),
    ]);
    expect(route_update_state_machine_edge).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId,
        edge: expect.objectContaining({
          id: "edge-a",
          hidden: true,
          zIndex: 7,
        }),
      }),
    );
  });
});
