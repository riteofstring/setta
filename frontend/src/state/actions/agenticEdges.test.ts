import {
  createAgenticEdgeFromSections,
  deleteSelectedAgenticEdges,
  toggleAgenticEdgeSelection,
  updateAgenticEdgeContextMode,
} from "state/actions/agenticEdges";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_create_agentic_edge: vi.fn(),
    route_delete_agentic_edges: vi.fn(),
    route_set_agentic_edges: vi.fn(),
    route_update_agentic_edge: vi.fn(),
  };
});

const projectConfigId = "project-1";
const sectionA = "section-a";
const sectionB = "section-b";
const variantA = "variant-a";
const variantB = "variant-b";
const implA = "impl-a";
const implB = "impl-b";

function seedChatSections() {
  const coreA = createCore({
    id: sectionA,
    name: "Chat A",
    variants: [variantA],
    defaultVariant: variantA,
  });
  const coreB = createCore({
    id: sectionB,
    name: "Chat B",
    variants: [variantB],
    defaultVariant: variantB,
  });
  const variantEntryA = createVariant({
    id: variantA,
    name: "Chat A Variant",
    impl: implA,
    nonPresetImpls: [],
  });
  const variantEntryB = createVariant({
    id: variantB,
    name: "Chat B Variant",
    impl: implB,
    nonPresetImpls: [],
  });
  const implEntryA = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: "chat-a" }),
    {
      id: implA,
      chatId: "chat-a",
      managed: true,
      engineConfigId: "engine-a",
      thinking: false,
    },
  );
  const implEntryB = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: "chat-b" }),
    {
      id: implB,
      chatId: "chat-b",
      managed: true,
      engineConfigId: "engine-b",
      thinking: false,
    },
  );

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = { [sectionA]: coreA, [sectionB]: coreB };
    state.sectionVariants = {
      [variantA]: variantEntryA,
      [variantB]: variantEntryB,
    };
    state.sectionImpls = { [implA]: implEntryA, [implB]: implEntryB };
    state.projectConfig.sectionVariantMap = {
      [sectionA]: variantA,
      [sectionB]: variantB,
    };
    state.previewSectionVariantMap = {};
  });
}

describe("agentic edge optimistic create", () => {
  beforeEach(() => {
    resetProjectStores();
    seedChatSections();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("creates and sends an optimistic agentic edge", async () => {
    const route_create_agentic_edge = (await import("utils/generatedEndpoints"))
      .route_create_agentic_edge as unknown as vi.Mock;
    route_create_agentic_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    createAgenticEdgeFromSections({
      sourceSectionId: sectionA,
      targetSectionId: sectionB,
      kind: AgenticEdgeKindEnum.chat_chat,
    });

    const edges = useProjectState.getState().projectConfig.agenticEdges;
    expect(edges).toHaveLength(1);
    const edge = edges[0];
    expect(edge.sourceSectionId).toBe(sectionA);
    expect(edge.targetSectionId).toBe(sectionB);
    expect(edge.kind).toBe(AgenticEdgeKindEnum.chat_chat);

    expect(route_create_agentic_edge).toHaveBeenCalledTimes(1);
    expect(route_create_agentic_edge.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        id: edge.id,
        sourceSectionId: sectionA,
        targetSectionId: sectionB,
        kind: AgenticEdgeKindEnum.chat_chat,
        frontendOpId: expect.any(String),
      }),
    );
  });
});

describe("agentic edge context mode updates", () => {
  beforeEach(() => {
    resetProjectStores();
    seedChatSections();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("updates context mode and persists the edge", async () => {
    const route_update_agentic_edge = (await import("utils/generatedEndpoints"))
      .route_update_agentic_edge as unknown as vi.Mock;
    route_update_agentic_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    const edge = createAgenticEdge({
      id: "edge-context",
      sourceSectionId: sectionA,
      targetSectionId: sectionB,
      kind: AgenticEdgeKindEnum.section_chat,
      contextMode: AgenticEdgeContextModeEnum.reference_only,
    });

    useProjectState.setState((state) => {
      state.projectConfig.agenticEdges = [edge];
    });

    updateAgenticEdgeContextMode(
      edge.id,
      AgenticEdgeContextModeEnum.inline_text,
    );

    const updatedEdge =
      useProjectState.getState().projectConfig.agenticEdges[0];
    expect(updatedEdge.contextMode).toBe(
      AgenticEdgeContextModeEnum.inline_text,
    );
    expect(route_update_agentic_edge).toHaveBeenCalledTimes(1);
    expect(route_update_agentic_edge.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        projectConfigId,
        edge: expect.objectContaining({
          id: edge.id,
          contextMode: AgenticEdgeContextModeEnum.inline_text,
        }),
        frontendOpId: expect.any(String),
      }),
    );
  });
});

describe("agentic edge selection and deletion", () => {
  beforeEach(() => {
    resetProjectStores();
    seedChatSections();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("single-selects an agentic edge through setAgenticEdges", async () => {
    const route_set_agentic_edges = (await import("utils/generatedEndpoints"))
      .route_set_agentic_edges as unknown as vi.Mock;
    route_set_agentic_edges.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      state.projectConfig.agenticEdges = [
        createAgenticEdge({
          id: "edge-a",
          sourceSectionId: sectionA,
          targetSectionId: sectionB,
          kind: AgenticEdgeKindEnum.chat_chat,
          selected: false,
        }),
        createAgenticEdge({
          id: "edge-b",
          sourceSectionId: sectionA,
          targetSectionId: sectionB,
          kind: AgenticEdgeKindEnum.chat_chat,
          selected: true,
        }),
      ];
    });

    toggleAgenticEdgeSelection("edge-a", false);

    expect(useProjectState.getState().projectConfig.agenticEdges).toMatchObject(
      [
        { id: "edge-a", selected: true },
        { id: "edge-b", selected: false },
      ],
    );
    expect(route_set_agentic_edges).toHaveBeenCalledTimes(1);
    expect(route_set_agentic_edges.mock.calls[0][0]).toEqual(
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

  it("deletes selected agentic edges through deleteAgenticEdges", async () => {
    const route_delete_agentic_edges = (
      await import("utils/generatedEndpoints")
    ).route_delete_agentic_edges as unknown as vi.Mock;
    route_delete_agentic_edges.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

    useProjectState.setState((state) => {
      state.projectConfig.agenticEdges = [
        createAgenticEdge({
          id: "edge-a",
          sourceSectionId: sectionA,
          targetSectionId: sectionB,
          kind: AgenticEdgeKindEnum.chat_chat,
          selected: true,
        }),
        createAgenticEdge({
          id: "edge-b",
          sourceSectionId: sectionA,
          targetSectionId: sectionB,
          kind: AgenticEdgeKindEnum.chat_chat,
          selected: false,
        }),
      ];
    });

    const deleted = deleteSelectedAgenticEdges();

    expect(deleted).toBe(true);
    expect(useProjectState.getState().projectConfig.agenticEdges).toMatchObject(
      [{ id: "edge-b" }],
    );
    expect(route_delete_agentic_edges).toHaveBeenCalledTimes(1);
    expect(route_delete_agentic_edges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        projectConfigId,
        frontendOpId: expect.any(String),
        edgeIds: ["edge-a"],
      }),
    );
  });
});
