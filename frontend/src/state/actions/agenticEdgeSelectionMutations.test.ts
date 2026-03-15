import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createProjectConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteAgenticEdgesById,
  deleteSelectedAgenticEdges,
  toggleAgenticEdgeSelection,
} from "./agenticEdgeSelectionMutations";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_delete_agentic_edges: vi.fn(),
    route_set_agentic_edges: vi.fn(),
    route_update_agentic_edge: vi.fn(),
  };
});

describe("agenticEdgeSelectionMutations", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("toggles single selection and persists the full edge list", async () => {
    const route_set_agentic_edges = (await import("utils/generatedEndpoints"))
      .route_set_agentic_edges as unknown as vi.Mock;
    route_set_agentic_edges.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        agenticEdges: [
          createAgenticEdge({
            id: "edge-1",
            sourceSectionId: "section-a",
            targetSectionId: "section-b",
            kind: AgenticEdgeKindEnum.chat_chat,
            selected: false,
          }),
          createAgenticEdge({
            id: "edge-2",
            sourceSectionId: "section-b",
            targetSectionId: "section-c",
            kind: AgenticEdgeKindEnum.chat_section,
            selected: true,
          }),
        ],
      });
    });

    toggleAgenticEdgeSelection("edge-1", false);

    expect(
      useProjectState.getState().projectConfig.agenticEdges.map((edge) => ({
        id: edge.id,
        selected: edge.selected,
      })),
    ).toEqual([
      { id: "edge-1", selected: true },
      { id: "edge-2", selected: false },
    ]);
    expect(route_set_agentic_edges).toHaveBeenCalledTimes(1);
    expect(route_set_agentic_edges.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        projectConfigId: "project-1",
        edges: expect.arrayContaining([
          expect.objectContaining({ id: "edge-1", selected: true }),
          expect.objectContaining({ id: "edge-2", selected: false }),
        ]),
        frontendOpId: expect.any(String),
      }),
    );
  });

  it("deletes selected or explicit edges while respecting deployment mode", async () => {
    const route_delete_agentic_edges = (
      await import("utils/generatedEndpoints")
    ).route_delete_agentic_edges as unknown as vi.Mock;
    route_delete_agentic_edges.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        agenticEdges: [
          createAgenticEdge({
            id: "edge-1",
            sourceSectionId: "section-a",
            targetSectionId: "section-b",
            kind: AgenticEdgeKindEnum.chat_chat,
            selected: true,
          }),
          createAgenticEdge({
            id: "edge-2",
            sourceSectionId: "section-b",
            targetSectionId: "section-c",
            kind: AgenticEdgeKindEnum.chat_section,
            selected: false,
          }),
        ],
      });
    });

    expect(deleteSelectedAgenticEdges()).toBe(true);
    expect(
      useProjectState
        .getState()
        .projectConfig.agenticEdges.map((edge) => edge.id),
    ).toEqual(["edge-2"]);
    expect(route_delete_agentic_edges).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-1",
        edgeIds: ["edge-1"],
        frontendOpId: expect.any(String),
      }),
    );

    deleteAgenticEdgesById(["edge-2"]);
    expect(useProjectState.getState().projectConfig.agenticEdges).toEqual([]);

    useShareSession.setState({ isDeploymentMode: true });
    expect(deleteSelectedAgenticEdges()).toBe(false);
    deleteAgenticEdgesById(["edge-2"]);
  });
});
