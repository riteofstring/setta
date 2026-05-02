import type { Connection } from "gpuFlow/flowTypes";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "state/actions/chatSharedHandleIds";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  createStateMachineEdgeFromConnection,
  isValidStateMachineEdgeConnection,
  replaceStateMachineEdge,
  STATE_MACHINE_EDGE_HANDLE_IDS,
} from "state/actions/stateMachineEdges";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createSectionSize,
  createStateMachineStartSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    createStateMachineEdge: vi.fn(),
    deleteStateMachineEdges: vi.fn(),
    setStateMachineEdges: vi.fn(),
    updateStateMachineEdge: vi.fn(),
  };
});
const projectConfigId = "project-1";
const machineGroupId = "workflow-main";
const otherMachineGroupId = "workflow-other";
const startSectionId = "section-start";
const gateSectionId = "section-gate";
const chatSectionId = "section-chat";
const endSectionId = "section-end";
const startVariantId = "variant-start";
const gateVariantId = "variant-gate";
const chatVariantId = "variant-chat";
const endVariantId = "variant-end";
const startImplId = "impl-start";
const gateImplId = "impl-gate";
const chatImplId = "impl-chat";
const endImplId = "impl-end";
function createStateMachineEndImpl(id: string, machineGroup: string) {
  return {
    type: SectionTypeEnum.StateMachineEnd,
    id,
    name: "End",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    styleColor: null,
    size: createSectionSize({ width: 240, height: 96 }),
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    machineGroupId: machineGroup,
    label: "End",
  };
}
function createStateMachineGateImpl(id: string, machineGroup: string) {
  return {
    type: SectionTypeEnum.StateMachineGate,
    id,
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
    machineGroupId: machineGroup,
    gateType: "AND",
    label: "AND Gate",
    ui: {
      showDetails: false,
    },
  };
}
function seedWorkflowSections() {
  const startImpl = createStateMachineStartSectionImpl({
    id: startImplId,
    machineGroupId,
    label: "Start",
  });
  const gateImpl = createStateMachineGateImpl(gateImplId, machineGroupId);
  const chatImpl = createChatSectionImpl({
    ...{ chatId: "chat-a" },
    ...{
      id: chatImplId,
      chatId: "chat-a",
      managed: true,
      engineConfigId: "engine-a",
      thinking: false,
    },
  });
  const endImpl = createStateMachineEndImpl(endImplId, machineGroupId);
  const startVariant = createVariant({
    id: startVariantId,
    name: "Start Variant",
    impl: startImplId,
    nonPresetImpls: [],
  });
  const gateVariant = createVariant({
    id: gateVariantId,
    name: "Gate Variant",
    impl: gateImplId,
    nonPresetImpls: [],
  });
  const chatVariant = createVariant({
    id: chatVariantId,
    name: "Chat Variant",
    impl: chatImplId,
    nonPresetImpls: [],
  });
  const endVariant = createVariant({
    id: endVariantId,
    name: "End Variant",
    impl: endImplId,
    nonPresetImpls: [],
  });
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: projectConfigId,
      sectionVariantMap: {
        [startSectionId]: startVariantId,
        [gateSectionId]: gateVariantId,
        [chatSectionId]: chatVariantId,
        [endSectionId]: endVariantId,
      },
    });
    state.sections = {
      [startSectionId]: createCore({
        id: startSectionId,
        name: "Start",
        variants: [startVariantId],
        defaultVariant: startVariantId,
      }),
      [gateSectionId]: createCore({
        id: gateSectionId,
        name: "Gate",
        variants: [gateVariantId],
        defaultVariant: gateVariantId,
      }),
      [chatSectionId]: createCore({
        id: chatSectionId,
        name: "Chat",
        variants: [chatVariantId],
        defaultVariant: chatVariantId,
      }),
      [endSectionId]: createCore({
        id: endSectionId,
        name: "End",
        variants: [endVariantId],
        defaultVariant: endVariantId,
      }),
    };
    state.sectionVariants = {
      [startVariantId]: startVariant,
      [gateVariantId]: gateVariant,
      [chatVariantId]: chatVariant,
      [endVariantId]: endVariant,
    };
    state.sectionImpls = {
      [startImplId]: startImpl,
      [gateImplId]: gateImpl,
      [chatImplId]: chatImpl,
      [endImplId]: endImpl,
    };
    state.previewSectionVariantMap = {};
  });
}
function createConnection(source: string, target: string): Connection {
  return {
    source,
    target,
    sourceHandle: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.target,
  };
}
function createSharedChatTargetConnection(
  source: string,
  target: string,
): Connection {
  return {
    source,
    target,
    sourceHandle: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    targetHandle: SHARED_CHAT_EDGE_HANDLE_IDS.target,
  };
}
function createExistingWorkflowEdge() {
  return {
    id: "edge-existing",
    machineGroupId,
    sourceSectionId: startSectionId,
    sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    targetSectionId: chatSectionId,
    targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
    sourceFilter: null,
    sourceActivationCountCondition: null,
    targetAction: {
      type: "reset_thread",
      promptTemplateId: null,
      promptSectionId: null,
      inlinePrompt: null,
      promptInputs: {},
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
  };
}
function mockOpenAPISuccess() {
  return {
    data: null,
    response: {
      status: 200,
    },
  };
}

describe("state machine edge creation", () => {
  beforeEach(() => {
    resetProjectStores();
    seedWorkflowSections();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
  });
  afterEach(() => {
    resetProjectStores();
  });
  it("creates a start-to-chat workflow edge with a default reset action", async () => {
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue(mockOpenAPISuccess());
    createStateMachineEdgeFromConnection(
      createConnection(startSectionId, chatSectionId),
    );
    const edges = useProjectState.getState().projectConfig.stateMachineEdges;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual(
      expect.objectContaining({
        machineGroupId,
        sourceSectionId: startSectionId,
        targetSectionId: chatSectionId,
        sourceFilter: null,
        sourceActivationCountCondition: null,
        targetAction: expect.objectContaining({
          type: "reset_thread",
          promptTemplateId: null,
          promptSectionId: null,
          inlinePrompt: null,
          promptInputs: {},
          threadStrategy: "continue_current_thread",
        }),
      }),
    );
    expect(createStateMachineEdge).toHaveBeenCalledTimes(1);
  });
  it("uses effective machine-group settings instead of stale raw impl values", async () => {
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue(mockOpenAPISuccess());
    useProjectState.setState((state) => {
      const startImpl = state.sectionImpls[startImplId];
      if (!startImpl || startImpl.type !== SectionTypeEnum.StateMachineStart) {
        throw new Error("Missing start impl in workflow test state.");
      }
      startImpl.machineGroupId = "stale-machine-group";
      state.sections[startSectionId].sharedModifier.machineGroupId =
        machineGroupId;
    });
    createStateMachineEdgeFromConnection(
      createConnection(startSectionId, chatSectionId),
    );
    const edge = useProjectState.getState().projectConfig.stateMachineEdges[0];
    expect(edge).toEqual(
      expect.objectContaining({
        machineGroupId,
        sourceSectionId: startSectionId,
        targetSectionId: chatSectionId,
      }),
    );
    expect(createStateMachineEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          machineGroupId,
        }),
      }),
    );
  });
  it("derives a unique machine group from an existing chat workflow edge", async () => {
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue(mockOpenAPISuccess());
    useProjectState.setState((state) => {
      state.projectConfig.stateMachineEdges = [
        {
          id: "edge-existing",
          machineGroupId,
          sourceSectionId: startSectionId,
          sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          targetSectionId: chatSectionId,
          targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          sourceFilter: null,
          sourceActivationCountCondition: null,
          targetAction: {
            type: "reset_thread",
            promptTemplateId: null,
            promptSectionId: null,
            inlinePrompt: null,
            promptInputs: {},
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
      ];
    });
    createStateMachineEdgeFromConnection(
      createConnection(chatSectionId, endSectionId),
    );
    const edges = useProjectState.getState().projectConfig.stateMachineEdges;
    expect(edges).toHaveLength(2);
    expect(edges[1]).toEqual(
      expect.objectContaining({
        machineGroupId,
        sourceSectionId: chatSectionId,
        targetSectionId: endSectionId,
        sourceFilter: expect.objectContaining({
          type: "run_completed",
        }),
        sourceActivationCountCondition: null,
        targetAction: null,
      }),
    );
  });
  it("accepts a shared chat target handle and stores canonical workflow ports", async () => {
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue(mockOpenAPISuccess());
    const connection = createSharedChatTargetConnection(
      startSectionId,
      chatSectionId,
    );
    expect(isValidStateMachineEdgeConnection(connection)).toBe(true);
    createStateMachineEdgeFromConnection(connection);
    const edge = useProjectState.getState().projectConfig.stateMachineEdges[0];
    expect(edge).toEqual(
      expect.objectContaining({
        sourceSectionId: startSectionId,
        targetSectionId: chatSectionId,
        sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
        targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
      }),
    );
  });
  it("normalizes reverse drags from workflow targets back to source-to-target edges", async () => {
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue(mockOpenAPISuccess());
    const reverseConnection: Connection = {
      source: endSectionId,
      sourceHandle: STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
      target: startSectionId,
      targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    };
    expect(isValidStateMachineEdgeConnection(reverseConnection)).toBe(true);
    createStateMachineEdgeFromConnection(reverseConnection);
    const edge = useProjectState.getState().projectConfig.stateMachineEdges[0];
    expect(edge).toEqual(
      expect.objectContaining({
        sourceSectionId: startSectionId,
        targetSectionId: endSectionId,
        sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
        targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
      }),
    );
  });
  it("merges workflow machine groups when connecting a gate to an end node", async () => {
    const createStateMachineEdge = (await import("openapi/http"))
      .createStateMachineEdge as unknown as vi.Mock;
    createStateMachineEdge.mockResolvedValue(mockOpenAPISuccess());
    useProjectState.setState((state) => {
      const gateImpl = state.sectionImpls[gateImplId];
      const endImpl = state.sectionImpls[endImplId];
      if (!gateImpl || gateImpl.type !== SectionTypeEnum.StateMachineGate) {
        throw new Error("Missing gate impl in workflow test state.");
      }
      if (!endImpl || endImpl.type !== SectionTypeEnum.StateMachineEnd) {
        throw new Error("Missing end impl in workflow test state.");
      }
      gateImpl.machineGroupId = machineGroupId;
      endImpl.machineGroupId = otherMachineGroupId;
      state.projectConfig.stateMachineEdges = [
        {
          id: "edge-existing",
          machineGroupId: otherMachineGroupId,
          sourceSectionId: chatSectionId,
          sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          targetSectionId: endSectionId,
          targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          sourceFilter: {
            type: "run_completed",
            signalName: null,
            payloadField: null,
            equals: null,
          },
          sourceActivationCountCondition: null,
          targetAction: null,
          style: null,
          hidden: false,
          zIndex: 0,
          selected: false,
        },
      ];
    });
    const connection = createConnection(gateSectionId, endSectionId);
    expect(isValidStateMachineEdgeConnection(connection)).toBe(true);
    createStateMachineEdgeFromConnection(connection);
    const currentState = useProjectState.getState();
    expect(currentState.projectConfig.stateMachineEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "edge-existing",
          machineGroupId,
        }),
        expect.objectContaining({
          machineGroupId,
          sourceSectionId: gateSectionId,
          targetSectionId: endSectionId,
        }),
      ]),
    );
    const endImpl = getCurrEffectiveSectionImpl(currentState, endSectionId);
    expect(endImpl).toMatchObject({
      type: SectionTypeEnum.StateMachineEnd,
      machineGroupId,
    });
    expect(createStateMachineEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          machineGroupId,
          sourceSectionId: gateSectionId,
          targetSectionId: endSectionId,
        }),
      }),
    );
  });
  it("rejects non-workflow handles and unresolved chat-only machine groups", () => {
    expect(
      isValidStateMachineEdgeConnection({
        source: startSectionId,
        target: chatSectionId,
        sourceHandle: "agentic-edge-source",
        targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.target,
      }),
    ).toBe(false);
    expect(
      isValidStateMachineEdgeConnection(
        createConnection(chatSectionId, chatSectionId),
      ),
    ).toBe(false);
    expect(
      isValidStateMachineEdgeConnection(
        createConnection(startSectionId, startSectionId),
      ),
    ).toBe(false);
    expect(
      isValidStateMachineEdgeConnection(
        createConnection(endSectionId, chatSectionId),
      ),
    ).toBe(false);
  });
});

describe("state machine edge updates", () => {
  beforeEach(() => {
    resetProjectStores();
    seedWorkflowSections();
    useShareSession.setState({ isDeploymentMode: false });
    vi.clearAllMocks();
    useProjectState.setState((state) => {
      state.projectConfig.stateMachineEdges = [createExistingWorkflowEdge()];
    });
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("returns backend errors and rolls back optimistic edge edits", async () => {
    const updateStateMachineEdge = (await import("openapi/http"))
      .updateStateMachineEdge as unknown as vi.Mock;
    updateStateMachineEdge.mockResolvedValue({
      error: {
        detail:
          "State machine edge edge-existing reset_thread actions cannot include prompt content or prompt inputs.",
      },
      response: {
        status: 422,
      },
    });

    const response = await replaceStateMachineEdge({
      ...createExistingWorkflowEdge(),
      targetAction: {
        ...createExistingWorkflowEdge().targetAction,
        promptInputs: {
          name: "Ada",
        },
      },
    });

    expect(response).toEqual({
      status: 422,
      hasResponse: true,
      data: {
        detail:
          "State machine edge edge-existing reset_thread actions cannot include prompt content or prompt inputs.",
      },
    });
    expect(
      useProjectState.getState().projectConfig.stateMachineEdges[0],
    ).toEqual(
      expect.objectContaining({
        id: "edge-existing",
        targetAction: expect.objectContaining({
          stopIfRunning: false,
        }),
      }),
    );
  });
});
