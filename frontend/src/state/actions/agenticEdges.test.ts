import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  createAgenticEdgeFromSections,
  deleteSelectedAgenticEdges,
  isValidAgenticEdgeConnection,
  toggleAgenticEdgeSelection,
  updateAgenticEdgeContextMode,
} from "state/actions/agenticEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createChatSectionImpl,
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createSectionSize,
  createVariant,
  SectionTypeEnum,
  StateMachineGateTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    createAgenticEdge: vi.fn(),
    deleteAgenticEdges: vi.fn(),
    setAgenticEdges: vi.fn(),
    updateAgenticEdge: vi.fn(),
  };
});
const projectConfigId = "project-1";
const sectionA = "section-a";
const sectionB = "section-b";
const sectionCode = "section-code";
const sectionGate = "section-gate";
const variantA = "variant-a";
const variantB = "variant-b";
const variantCode = "variant-code";
const variantGate = "variant-gate";
const implA = "impl-a";
const implB = "impl-b";
const implCode = "impl-code";
const implGate = "impl-gate";

function createOpenAPISuccessResponse() {
  return {
    data: null,
    response: new Response(null, { status: 200 }),
  };
}

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
  const coreCode = createCore({
    id: sectionCode,
    name: "Code",
    variants: [variantCode],
    defaultVariant: variantCode,
  });
  const coreGate = createCore({
    id: sectionGate,
    name: "Gate",
    variants: [variantGate],
    defaultVariant: variantGate,
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
  const variantEntryCode = createVariant({
    id: variantCode,
    name: "Code Variant",
    impl: implCode,
    nonPresetImpls: [],
  });
  const variantEntryGate = createVariant({
    id: variantGate,
    name: "Gate Variant",
    impl: implGate,
    nonPresetImpls: [],
  });
  const implEntryA = createChatSectionImpl({
    ...{ chatId: "chat-a" },
    ...{
      id: implA,
      chatId: "chat-a",
      managed: true,
      engineConfigId: "engine-a",
      thinking: false,
    },
  });
  const implEntryB = createChatSectionImpl({
    ...{ chatId: "chat-b" },
    ...{
      id: implB,
      chatId: "chat-b",
      managed: true,
      engineConfigId: "engine-b",
      thinking: false,
    },
  });
  const implEntryCode = createCodeSectionImpl({
    ...{
      id: implCode,
      type: SectionTypeEnum.Code,
    },
    ...{
      id: implCode,
      type: SectionTypeEnum.Code,
    },
  });
  const implEntryGate = {
    id: implGate,
    type: SectionTypeEnum.StateMachineGate,
    name: "Gate",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    styleColor: null,
    size: createSectionSize({ width: 240, height: 120 }),
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    machineGroupId: "workflow-main",
    gateType: StateMachineGateTypeEnum.AND,
    label: "Gate",
    ui: { showDetails: false },
  };
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({ id: projectConfigId });
    state.sections = {
      [sectionA]: coreA,
      [sectionB]: coreB,
      [sectionCode]: coreCode,
      [sectionGate]: coreGate,
    };
    state.sectionVariants = {
      [variantA]: variantEntryA,
      [variantB]: variantEntryB,
      [variantCode]: variantEntryCode,
      [variantGate]: variantEntryGate,
    };
    state.sectionImpls = {
      [implA]: implEntryA,
      [implB]: implEntryB,
      [implCode]: implEntryCode,
      [implGate]: implEntryGate,
    };
    state.projectConfig.sectionVariantMap = {
      [sectionA]: variantA,
      [sectionB]: variantB,
      [sectionCode]: variantCode,
      [sectionGate]: variantGate,
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
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue(createOpenAPISuccessResponse());
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
    expect(createAgenticEdge).toHaveBeenCalledTimes(1);
    expect(createAgenticEdge.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          id: edge.id,
          sourceSectionId: sectionA,
          targetSectionId: sectionB,
          kind: AgenticEdgeKindEnum.chat_chat,
          frontendOpId: expect.any(String),
        }),
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
    const updateAgenticEdge = (await import("openapi/http"))
      .updateAgenticEdge as unknown as vi.Mock;
    updateAgenticEdge.mockResolvedValue(createOpenAPISuccessResponse());
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
    expect(updateAgenticEdge).toHaveBeenCalledTimes(1);
    expect(updateAgenticEdge.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          projectConfigId,
          edge: expect.objectContaining({
            id: edge.id,
            contextMode: AgenticEdgeContextModeEnum.inline_text,
          }),
          frontendOpId: expect.any(String),
        }),
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
    const setAgenticEdges = (await import("openapi/http"))
      .setAgenticEdges as unknown as vi.Mock;
    setAgenticEdges.mockResolvedValue(createOpenAPISuccessResponse());
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
    expect(setAgenticEdges).toHaveBeenCalledTimes(1);
    expect(setAgenticEdges.mock.calls[0][0]).toEqual(
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
  it("deletes selected agentic edges through deleteAgenticEdges", async () => {
    const deleteAgenticEdges = (await import("openapi/http"))
      .deleteAgenticEdges as unknown as vi.Mock;
    deleteAgenticEdges.mockResolvedValue(createOpenAPISuccessResponse());
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
    expect(deleteAgenticEdges).toHaveBeenCalledTimes(1);
    expect(deleteAgenticEdges.mock.calls[0][0]).toEqual(
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
describe("agentic edge connections", () => {
  beforeEach(() => {
    resetProjectStores();
    seedChatSections();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });
  afterEach(() => {
    resetProjectStores();
  });
  it("accepts shared chat handles when connecting code to chat", async () => {
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue(createOpenAPISuccessResponse());
    const connection = {
      source: sectionCode,
      target: sectionA,
      sourceHandle: AGENTIC_EDGE_HANDLE_IDS.source,
      targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
    };
    expect(isValidAgenticEdgeConnection(connection)).toBe(true);
    createAgenticEdgeFromConnection(connection);
    const edges = useProjectState.getState().projectConfig.agenticEdges;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual(
      expect.objectContaining({
        sourceSectionId: sectionCode,
        targetSectionId: sectionA,
        kind: AgenticEdgeKindEnum.section_chat,
      }),
    );
  });
  it("rejects workflow nodes as agentic endpoints", async () => {
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue(createOpenAPISuccessResponse());
    const connection = {
      source: sectionA,
      target: sectionGate,
      sourceHandle: AGENTIC_EDGE_HANDLE_IDS.source,
      targetHandle: AGENTIC_EDGE_HANDLE_IDS.target,
    };
    expect(isValidAgenticEdgeConnection(connection)).toBe(false);
    createAgenticEdgeFromConnection(connection);
    createAgenticEdgeFromSections({
      sourceSectionId: sectionA,
      targetSectionId: sectionGate,
      kind: AgenticEdgeKindEnum.chat_section,
    });
    expect(useProjectState.getState().projectConfig.agenticEdges).toHaveLength(
      0,
    );
    expect(createAgenticEdge).not.toHaveBeenCalled();
  });
  it("rejects shared chat handles on non-chat sources", async () => {
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue(createOpenAPISuccessResponse());
    const connection = {
      source: sectionCode,
      target: sectionA,
      sourceHandle: SHARED_CHAT_EDGE_HANDLE_IDS.source,
      targetHandle: AGENTIC_EDGE_HANDLE_IDS.target,
    };
    expect(isValidAgenticEdgeConnection(connection)).toBe(false);
    createAgenticEdgeFromConnection(connection);
    expect(useProjectState.getState().projectConfig.agenticEdges).toHaveLength(
      0,
    );
    expect(createAgenticEdge).not.toHaveBeenCalled();
  });
  it("rejects shared chat handles on non-chat targets", async () => {
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue(createOpenAPISuccessResponse());
    const connection = {
      source: sectionA,
      target: sectionCode,
      sourceHandle: AGENTIC_EDGE_HANDLE_IDS.source,
      targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
    };
    expect(isValidAgenticEdgeConnection(connection)).toBe(false);
    createAgenticEdgeFromConnection(connection);
    expect(useProjectState.getState().projectConfig.agenticEdges).toHaveLength(
      0,
    );
    expect(createAgenticEdge).not.toHaveBeenCalled();
  });
  it("normalizes reverse drags from agentic targets back to chat-to-section edges", async () => {
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue(createOpenAPISuccessResponse());
    const connection = {
      source: sectionCode,
      sourceHandle: AGENTIC_EDGE_HANDLE_IDS.reverseStart,
      target: sectionA,
      targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.source,
    };
    expect(isValidAgenticEdgeConnection(connection)).toBe(true);
    createAgenticEdgeFromConnection(connection);
    const edges = useProjectState.getState().projectConfig.agenticEdges;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual(
      expect.objectContaining({
        sourceSectionId: sectionA,
        targetSectionId: sectionCode,
        kind: AgenticEdgeKindEnum.chat_section,
      }),
    );
  });
});
