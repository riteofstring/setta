import type { Connection } from "forks/xyflow/core/types";
import { useProjectState } from "state/definitions";
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
  StateMachineGateTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "./stateMachineEdgeCanonicalization";
import { resolveMachineGroupTransitionForConnection } from "./stateMachineEdgeGraph";

const machineGroupId = "workflow-main";
const otherMachineGroupId = "workflow-other";
const startSectionId = "section-start";
const chatSectionA = "section-chat-a";
const chatSectionB = "section-chat-b";
const gateSectionId = "section-gate";
const endSectionId = "section-end";

function createWorkflowConnection(source: string, target: string): Connection {
  return {
    source,
    target,
    sourceHandle: STATE_MACHINE_EDGE_HANDLE_IDS.source,
    targetHandle: STATE_MACHINE_EDGE_HANDLE_IDS.target,
  };
}

function createStateMachineGateImpl(id: string, machineGroup: string) {
  return {
    id,
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
    machineGroupId: machineGroup,
    gateType: StateMachineGateTypeEnum.AND,
    label: "Gate",
    ui: { showDetails: false },
  };
}

function createStateMachineEndImpl(id: string, machineGroup: string) {
  return {
    id,
    type: SectionTypeEnum.StateMachineEnd,
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

function seedWorkflowGraphState() {
  const startImpl = createStateMachineStartSectionImpl(
    {},
    {
      id: "impl-start",
      machineGroupId,
      label: "Start",
    },
  );
  const chatAImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: "chat-a" }),
    {
      id: "impl-chat-a",
      chatId: "chat-a",
      managed: true,
      engineConfigId: "engine-a",
      thinking: false,
    },
  );
  const chatBImpl = createChatSectionImpl(
    createUserDefaultChatSectionImpl({ chatId: "chat-b" }),
    {
      id: "impl-chat-b",
      chatId: "chat-b",
      managed: true,
      engineConfigId: "engine-b",
      thinking: false,
    },
  );
  const gateImpl = createStateMachineGateImpl("impl-gate", machineGroupId);
  const endImpl = createStateMachineEndImpl("impl-end", otherMachineGroupId);

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [startSectionId]: "variant-start",
        [chatSectionA]: "variant-chat-a",
        [chatSectionB]: "variant-chat-b",
        [gateSectionId]: "variant-gate",
        [endSectionId]: "variant-end",
      },
    });
    state.sections = {
      [startSectionId]: createCore({
        id: startSectionId,
        name: "Start",
        variants: ["variant-start"],
        defaultVariant: "variant-start",
      }),
      [chatSectionA]: createCore({
        id: chatSectionA,
        name: "Chat A",
        variants: ["variant-chat-a"],
        defaultVariant: "variant-chat-a",
      }),
      [chatSectionB]: createCore({
        id: chatSectionB,
        name: "Chat B",
        variants: ["variant-chat-b"],
        defaultVariant: "variant-chat-b",
      }),
      [gateSectionId]: createCore({
        id: gateSectionId,
        name: "Gate",
        variants: ["variant-gate"],
        defaultVariant: "variant-gate",
      }),
      [endSectionId]: createCore({
        id: endSectionId,
        name: "End",
        variants: ["variant-end"],
        defaultVariant: "variant-end",
      }),
    };
    state.sectionVariants = {
      "variant-start": createVariant({
        id: "variant-start",
        name: "Start Variant",
        impl: "impl-start",
        nonPresetImpls: [],
      }),
      "variant-chat-a": createVariant({
        id: "variant-chat-a",
        name: "Chat A Variant",
        impl: "impl-chat-a",
        nonPresetImpls: [],
      }),
      "variant-chat-b": createVariant({
        id: "variant-chat-b",
        name: "Chat B Variant",
        impl: "impl-chat-b",
        nonPresetImpls: [],
      }),
      "variant-gate": createVariant({
        id: "variant-gate",
        name: "Gate Variant",
        impl: "impl-gate",
        nonPresetImpls: [],
      }),
      "variant-end": createVariant({
        id: "variant-end",
        name: "End Variant",
        impl: "impl-end",
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      "impl-start": startImpl,
      "impl-chat-a": chatAImpl,
      "impl-chat-b": chatBImpl,
      "impl-gate": gateImpl,
      "impl-end": endImpl,
    };
    state.previewSectionVariantMap = {};
  });
}

describe("stateMachineEdgeGraph", () => {
  beforeEach(() => {
    resetProjectStores();
    seedWorkflowGraphState();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("derives a unique machine group from an existing chat workflow edge", () => {
    useProjectState.setState((state) => {
      state.projectConfig.stateMachineEdges = [
        {
          id: "edge-existing",
          machineGroupId,
          sourceSectionId: startSectionId,
          sourcePortId: STATE_MACHINE_EDGE_HANDLE_IDS.source,
          targetSectionId: chatSectionA,
          targetPortId: STATE_MACHINE_EDGE_HANDLE_IDS.target,
          sourceFilter: null,
          sourceActivationCountCondition: null,
          targetAction: null,
          style: null,
          hidden: false,
          zIndex: 0,
          selected: false,
        },
      ];
    });

    expect(
      resolveMachineGroupTransitionForConnection(
        createWorkflowConnection(chatSectionA, chatSectionB),
        useProjectState.getState(),
      ),
    ).toEqual({
      machineGroupId,
      mergedMachineGroupIds: [],
    });
  });
});
