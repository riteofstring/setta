import type { Connection } from "forks/xyflow/core/types";
import {
  createStateMachineEdgeFromConnection,
  isValidStateMachineEdgeConnection,
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
  createUserDefaultChatSectionImpl,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_create_state_machine_edge: vi.fn(),
    route_delete_state_machine_edges: vi.fn(),
    route_set_state_machine_edges: vi.fn(),
    route_update_state_machine_edge: vi.fn(),
  };
});

const projectConfigId = "project-1";
const machineGroupId = "workflow-main";
const startSectionId = "section-start";
const chatSectionId = "section-chat";
const endSectionId = "section-end";
const startVariantId = "variant-start";
const chatVariantId = "variant-chat";
const endVariantId = "variant-end";
const startImplId = "impl-start";
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

function seedWorkflowSections() {
  const startImpl = createStateMachineStartSectionImpl(
    {},
    {
      id: startImplId,
      machineGroupId,
      label: "Start",
    },
  );
  const chatImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: "chat-a" }),
    {
      id: chatImplId,
      chatId: "chat-a",
      managed: true,
      engineConfigId: "engine-a",
      thinking: false,
    },
  );
  const endImpl = createStateMachineEndImpl(endImplId, machineGroupId);

  const startVariant = createVariant({
    id: startVariantId,
    name: "Start Variant",
    impl: startImplId,
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
      [chatVariantId]: chatVariant,
      [endVariantId]: endVariant,
    };
    state.sectionImpls = {
      [startImplId]: startImpl,
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
    const route_create_state_machine_edge = (
      await import("utils/generatedEndpoints")
    ).route_create_state_machine_edge as unknown as vi.Mock;
    route_create_state_machine_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

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
        targetAction: expect.objectContaining({
          type: "reset_thread",
          threadStrategy: "continue_current_thread",
        }),
      }),
    );
    expect(route_create_state_machine_edge).toHaveBeenCalledTimes(1);
  });

  it("derives a unique machine group from an existing chat workflow edge", async () => {
    const route_create_state_machine_edge = (
      await import("utils/generatedEndpoints")
    ).route_create_state_machine_edge as unknown as vi.Mock;
    route_create_state_machine_edge.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: null,
    });

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
        targetAction: null,
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
  });
});
