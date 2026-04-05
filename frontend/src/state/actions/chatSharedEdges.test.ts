import type { Connection } from "forks/xyflow/core/types";
import {
  createSharedChatEdgeFromConnection,
  isValidSharedChatEdgeConnection,
} from "state/actions/chatSharedEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "state/actions/stateMachineEdges";
import {
  useLocalStorage,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgenticEdgeKindEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createSectionSize,
  createStateMachineStartSectionImpl,
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
    createStateMachineEdge: vi.fn(),
  };
});
const projectConfigId = "project-1";
const machineGroupId = "workflow-main";
const startSectionId = "section-start";
const chatSectionA = "section-chat-a";
const chatSectionB = "section-chat-b";
const gateSectionId = "section-gate";
const startVariantId = "variant-start";
const chatVariantA = "variant-chat-a";
const chatVariantB = "variant-chat-b";
const gateVariantId = "variant-gate";
const startImplId = "impl-start";
const chatImplA = "impl-chat-a";
const chatImplB = "impl-chat-b";
const gateImplId = "impl-gate";
function createSharedChatConnection(): Connection {
  return {
    source: chatSectionA,
    target: chatSectionB,
    sourceHandle: SHARED_CHAT_EDGE_HANDLE_IDS.source,
    targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
  };
}
function seedWorkflowAwareChats() {
  const startImpl = createStateMachineStartSectionImpl({
    id: startImplId,
    machineGroupId,
    label: "Start",
  });
  const chatAImpl = createChatSectionImpl({
    ...{ chatId: "chat-a" },
    ...{
      id: chatImplA,
      chatId: "chat-a",
      managed: true,
      engineConfigId: "engine-a",
      thinking: false,
    },
  });
  const chatBImpl = createChatSectionImpl({
    ...{ chatId: "chat-b" },
    ...{
      id: chatImplB,
      chatId: "chat-b",
      managed: true,
      engineConfigId: "engine-b",
      thinking: false,
    },
  });
  const gateImpl = {
    id: gateImplId,
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
    machineGroupId,
    gateType: StateMachineGateTypeEnum.AND,
    label: "Gate",
    ui: { showDetails: false },
  };
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: projectConfigId,
      sectionVariantMap: {
        [startSectionId]: startVariantId,
        [chatSectionA]: chatVariantA,
        [chatSectionB]: chatVariantB,
        [gateSectionId]: gateVariantId,
      },
      stateMachineEdges: [
        {
          id: "edge-start-chat-a",
          machineGroupId,
          sourceSectionId: startSectionId,
          sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          targetSectionId: chatSectionA,
          targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          sourceFilter: null,
          targetAction: {
            type: "reset_thread",
            promptTemplateId: null,
            inlinePrompt: null,
            threadStrategy: "continue_current_thread",
            stopIfRunning: false,
            engineConfigId: null,
            agentProfileId: null,
            permissionMode: null,
            searchEnabled: null,
          },
          style: null,
          hidden: false,
          zIndex: 0,
          selected: false,
        },
      ],
    });
    state.sections = {
      [startSectionId]: createCore({
        id: startSectionId,
        name: "Start",
        variants: [startVariantId],
        defaultVariant: startVariantId,
      }),
      [chatSectionA]: createCore({
        id: chatSectionA,
        name: "Chat A",
        variants: [chatVariantA],
        defaultVariant: chatVariantA,
      }),
      [chatSectionB]: createCore({
        id: chatSectionB,
        name: "Chat B",
        variants: [chatVariantB],
        defaultVariant: chatVariantB,
      }),
      [gateSectionId]: createCore({
        id: gateSectionId,
        name: "Gate",
        variants: [gateVariantId],
        defaultVariant: gateVariantId,
      }),
    };
    state.sectionVariants = {
      [startVariantId]: createVariant({
        id: startVariantId,
        name: "Start Variant",
        impl: startImplId,
        nonPresetImpls: [],
      }),
      [chatVariantA]: createVariant({
        id: chatVariantA,
        name: "Chat A Variant",
        impl: chatImplA,
        nonPresetImpls: [],
      }),
      [chatVariantB]: createVariant({
        id: chatVariantB,
        name: "Chat B Variant",
        impl: chatImplB,
        nonPresetImpls: [],
      }),
      [gateVariantId]: createVariant({
        id: gateVariantId,
        name: "Gate Variant",
        impl: gateImplId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      [startImplId]: startImpl,
      [chatImplA]: chatAImpl,
      [chatImplB]: chatBImpl,
      [gateImplId]: gateImpl,
    };
    state.previewSectionVariantMap = {};
  });
}
describe("shared chat edge connections", () => {
  beforeEach(() => {
    resetProjectStores();
    seedWorkflowAwareChats();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });
  afterEach(() => {
    resetProjectStores();
  });
  it("uses the agentic family for ambiguous chat-to-chat connections in agentic mode", async () => {
    useLocalStorage.setState({ chatSharedEdgeMode: "agentic" });
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const connection = createSharedChatConnection();
    expect(isValidSharedChatEdgeConnection(connection)).toBe(true);
    createSharedChatEdgeFromConnection(connection);
    expect(useProjectState.getState().projectConfig.agenticEdges).toHaveLength(
      1,
    );
    expect(useProjectState.getState().projectConfig.agenticEdges[0]).toEqual(
      expect.objectContaining({
        sourceSectionId: chatSectionA,
        targetSectionId: chatSectionB,
        kind: AgenticEdgeKindEnum.chat_chat,
      }),
    );
    expect(
      useProjectState.getState().projectConfig.stateMachineEdges,
    ).toHaveLength(1);
  });
  it("uses the workflow family for ambiguous chat-to-chat connections in workflow mode", async () => {
    useLocalStorage.setState({ chatSharedEdgeMode: "workflow" });
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const connection = createSharedChatConnection();
    expect(isValidSharedChatEdgeConnection(connection)).toBe(true);
    createSharedChatEdgeFromConnection(connection);
    expect(useProjectState.getState().projectConfig.agenticEdges).toHaveLength(
      0,
    );
    expect(
      useProjectState.getState().projectConfig.stateMachineEdges,
    ).toHaveLength(2);
    expect(
      useProjectState.getState().projectConfig.stateMachineEdges[1],
    ).toEqual(
      expect.objectContaining({
        machineGroupId,
        sourceSectionId: chatSectionA,
        targetSectionId: chatSectionB,
        sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
        targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
      }),
    );
  });
  it("rejects shared handles on non-chat sections", () => {
    const invalidConnection: Connection = {
      source: startSectionId,
      target: chatSectionA,
      sourceHandle: SHARED_CHAT_EDGE_HANDLE_IDS.source,
      targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
    };
    expect(isValidSharedChatEdgeConnection(invalidConnection)).toBe(false);
  });
  it("routes chat-to-gate shared connections to the workflow family regardless of mode", async () => {
    useLocalStorage.setState({ chatSharedEdgeMode: "agentic" });
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const connection: Connection = {
      source: chatSectionA,
      target: gateSectionId,
      sourceHandle: SHARED_CHAT_EDGE_HANDLE_IDS.source,
      targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.target,
    };
    expect(isValidSharedChatEdgeConnection(connection)).toBe(true);
    createSharedChatEdgeFromConnection(connection);
    expect(useProjectState.getState().projectConfig.agenticEdges).toHaveLength(
      0,
    );
    expect(
      useProjectState.getState().projectConfig.stateMachineEdges,
    ).toHaveLength(2);
    expect(createStateMachineEdge).toHaveBeenCalledTimes(1);
    expect(createAgenticEdge).not.toHaveBeenCalled();
  });
  it("normalizes reverse drags from shared chat inputs in agentic mode", async () => {
    useLocalStorage.setState({ chatSharedEdgeMode: "agentic" });
    const createAgenticEdge = (await import("openapi/http"))
      .createAgenticEdge as unknown as vi.Mock;
    createAgenticEdge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });
    const reverseConnection: Connection = {
      source: chatSectionB,
      sourceHandle: SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart,
      target: chatSectionA,
      targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.source,
    };
    expect(isValidSharedChatEdgeConnection(reverseConnection)).toBe(true);
    createSharedChatEdgeFromConnection(reverseConnection);
    expect(useProjectState.getState().projectConfig.agenticEdges).toHaveLength(
      1,
    );
    expect(useProjectState.getState().projectConfig.agenticEdges[0]).toEqual(
      expect.objectContaining({
        sourceSectionId: chatSectionA,
        targetSectionId: chatSectionB,
        kind: AgenticEdgeKindEnum.chat_chat,
      }),
    );
  });
});
