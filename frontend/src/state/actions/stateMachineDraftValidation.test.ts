import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  type BaseSectionImplUnion,
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
import { getStateMachineDraftWarning } from "./stateMachineDraftValidation";

type WorkflowSectionSeed = {
  displayName?: string;
  impl: BaseSectionImplUnion;
  sectionName?: string;
  sectionId: string;
  variantId: string;
};

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];

const COMMON_MACHINE_IMPL_FIELDS = {
  isFrozen: false,
  isInOtherProjectConfigs: false,
  tagColor: null,
  styleColor: null,
  aspectRatio: false,
  aspectRatioExtraHeight: 0,
  aspectRatioExtraWidth: 0,
  isMinimized: false,
  positionAndSizeLocked: false,
  isPreset: false,
} as const;

function createEndSectionImpl({
  implId,
  machineGroupId,
  name,
}: {
  implId: string;
  machineGroupId: string;
  name: string;
}) {
  return {
    id: implId,
    type: SectionTypeEnum.StateMachineEnd,
    name,
    size: createSectionSize({ width: 240, height: 96 }),
    machineGroupId,
    label: "End",
    ...COMMON_MACHINE_IMPL_FIELDS,
  };
}

function createGateSectionImpl({
  implId,
  machineGroupId,
  name,
}: {
  implId: string;
  machineGroupId: string;
  name: string;
}) {
  return {
    id: implId,
    type: SectionTypeEnum.StateMachineGate,
    name,
    size: createSectionSize({ width: 240, height: 96 }),
    machineGroupId,
    label: "Gate",
    gateType: StateMachineGateTypeEnum.AND,
    ui: { showDetails: false },
    ...COMMON_MACHINE_IMPL_FIELDS,
  };
}

function createChatWorkflowImpl({
  implId,
  name,
}: {
  implId: string;
  name: string;
}) {
  return createChatSectionImpl(createUserDefaultChatSectionImpl(), {
    id: implId,
    name,
  });
}

function createWorkflowEdge(
  overrides: Partial<WorkflowEdge> &
    Pick<
      WorkflowEdge,
      | "id"
      | "machineGroupId"
      | "sourceSectionId"
      | "sourcePortId"
      | "targetSectionId"
      | "targetPortId"
    >,
): WorkflowEdge {
  return {
    sourceFilter: null,
    targetAction: null,
    style: null,
    hidden: false,
    zIndex: 0,
    selected: false,
    ...overrides,
  };
}

function seedWorkflowGraph({
  edges,
  sections,
}: {
  edges: WorkflowEdge[];
  sections: WorkflowSectionSeed[];
}): void {
  const sectionVariantMap: Record<string, string> = {};
  const storeState = useProjectState.getState();
  const seededSections: typeof storeState.sections = {};
  const seededVariants: typeof storeState.sectionVariants = {};
  const seededImpls: typeof storeState.sectionImpls = {};

  for (const section of sections) {
    sectionVariantMap[section.sectionId] = section.variantId;
    seededSections[section.sectionId] = createCore({
      id: section.sectionId,
      name:
        section.sectionName ??
        (typeof section.impl.name === "string"
          ? section.impl.name
          : section.sectionId),
      displayName: section.displayName ?? "",
      variants: [section.variantId],
      defaultVariant: section.variantId,
    });
    seededVariants[section.variantId] = createVariant({
      id: section.variantId,
      name: `${section.sectionId} Variant`,
      impl:
        typeof section.impl.id === "string"
          ? section.impl.id
          : `${section.sectionId}-impl`,
      nonPresetImpls: [],
    });
    seededImpls[
      typeof section.impl.id === "string"
        ? section.impl.id
        : `${section.sectionId}-impl`
    ] = section.impl;
  }

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap,
      stateMachineEdges: edges,
    });
    state.sections = seededSections;
    state.sectionVariants = seededVariants;
    state.sectionImpls = seededImpls;
    state.previewSectionVariantMap = {};
  });
}

describe("state machine draft validation", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("warns when a machine group is missing both Start and End sections", () => {
    seedWorkflowGraph({
      sections: [],
      edges: [],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toEqual(
      expect.objectContaining({
        startCount: 0,
        endCount: 0,
        issueCount: 1,
      }),
    );
  });

  it("warns when a machine group has multiple Start sections", () => {
    seedWorkflowGraph({
      sections: [
        {
          sectionId: "start-a",
          variantId: "variant-start-a",
          impl: createStateMachineStartSectionImpl(
            {},
            {
              id: "impl-start-a",
              name: "Start A",
              machineGroupId: "workflow-main",
              label: "Start A",
            },
          ),
        },
        {
          sectionId: "start-b",
          variantId: "variant-start-b",
          impl: createStateMachineStartSectionImpl(
            {},
            {
              id: "impl-start-b",
              name: "Start B",
              machineGroupId: "workflow-main",
              label: "Start B",
            },
          ),
        },
        {
          sectionId: "end-a",
          variantId: "variant-end-a",
          impl: createEndSectionImpl({
            implId: "impl-end-a",
            machineGroupId: "workflow-main",
            name: "End A",
          }),
        },
      ],
      edges: [],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toEqual(
      expect.objectContaining({
        startCount: 2,
        endCount: 1,
      }),
    );
  });

  it("warns when a machine has no reachable end because Start has no outgoing edges", () => {
    seedWorkflowGraph({
      sections: [
        {
          sectionId: "start-a",
          variantId: "variant-start-a",
          impl: createStateMachineStartSectionImpl(
            {},
            {
              id: "impl-start-a",
              name: "Start A",
              machineGroupId: "workflow-main",
              label: "Start A",
            },
          ),
        },
        {
          sectionId: "end-a",
          variantId: "variant-end-a",
          impl: createEndSectionImpl({
            implId: "impl-end-a",
            machineGroupId: "workflow-main",
            name: "End A",
          }),
        },
      ],
      edges: [],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toEqual(
      expect.objectContaining({
        detail: expect.stringContaining(
          "Its Start section has no outgoing workflow edges.",
        ),
      }),
    );
  });

  it("warns when a workflow reaches a Gate but still has no End", () => {
    seedWorkflowGraph({
      sections: [
        {
          sectionId: "start-a",
          variantId: "variant-start-a",
          impl: createStateMachineStartSectionImpl(
            {},
            {
              id: "impl-start-a",
              name: "Start A",
              machineGroupId: "workflow-main",
              label: "Start A",
            },
          ),
        },
        {
          sectionId: "gate-a",
          variantId: "variant-gate-a",
          impl: createGateSectionImpl({
            implId: "impl-gate-a",
            machineGroupId: "workflow-main",
            name: "Gate A",
          }),
        },
      ],
      edges: [
        createWorkflowEdge({
          id: "edge-start-gate",
          machineGroupId: "workflow-main",
          sourceSectionId: "start-a",
          sourcePortId: "workflow-source",
          targetSectionId: "gate-a",
          targetPortId: "workflow-target",
        }),
      ],
    });

    const warning = getStateMachineDraftWarning(
      useProjectState.getState(),
      "workflow-main",
    );

    expect(warning).not.toBeNull();
    expect(warning).toEqual(
      expect.objectContaining({
        startCount: 1,
        endCount: 0,
        issueCount: 1,
      }),
    );
    expect(warning?.detail).toContain("at least 1 End");
  });

  it("warns when a reachable chat can never emit run-based outputs", () => {
    seedWorkflowGraph({
      sections: [
        {
          sectionId: "start-a",
          variantId: "variant-start-a",
          impl: createStateMachineStartSectionImpl(
            {},
            {
              id: "impl-start-a",
              name: "Start A",
              machineGroupId: "workflow-main",
              label: "Start A",
            },
          ),
        },
        {
          sectionId: "chat-a",
          variantId: "variant-chat-a",
          sectionName: "plant_green",
          impl: createChatWorkflowImpl({
            implId: "impl-chat-a",
            name: "deep_late",
          }),
        },
        {
          sectionId: "end-a",
          variantId: "variant-end-a",
          impl: createEndSectionImpl({
            implId: "impl-end-a",
            machineGroupId: "workflow-main",
            name: "End A",
          }),
        },
      ],
      edges: [
        createWorkflowEdge({
          id: "edge-start-chat",
          machineGroupId: "workflow-main",
          sourceSectionId: "start-a",
          sourcePortId: "workflow-source",
          targetSectionId: "chat-a",
          targetPortId: "workflow-target",
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
        }),
        createWorkflowEdge({
          id: "edge-chat-end",
          machineGroupId: "workflow-main",
          sourceSectionId: "chat-a",
          sourcePortId: "workflow-source",
          targetSectionId: "end-a",
          targetPortId: "workflow-target",
          sourceFilter: {
            type: "run_completed",
            signalName: null,
            payloadField: null,
            equals: null,
          },
        }),
      ],
    });

    const warning = getStateMachineDraftWarning(
      useProjectState.getState(),
      "workflow-main",
    );
    expect(warning).not.toBeNull();
    expect(warning?.detail).toContain('Chat section "plant_green"');
    expect(warning?.detail).toContain(
      "no reachable Send Prompt action starts a workflow child run",
    );
  });

  it("returns null for a direct Start-to-End workflow", () => {
    seedWorkflowGraph({
      sections: [
        {
          sectionId: "start-a",
          variantId: "variant-start-a",
          impl: createStateMachineStartSectionImpl(
            {},
            {
              id: "impl-start-a",
              name: "Start A",
              machineGroupId: "workflow-main",
              label: "Start A",
            },
          ),
        },
        {
          sectionId: "end-a",
          variantId: "variant-end-a",
          impl: createEndSectionImpl({
            implId: "impl-end-a",
            machineGroupId: "workflow-main",
            name: "End A",
          }),
        },
      ],
      edges: [
        createWorkflowEdge({
          id: "edge-start-end",
          machineGroupId: "workflow-main",
          sourceSectionId: "start-a",
          sourcePortId: "workflow-source",
          targetSectionId: "end-a",
          targetPortId: "workflow-target",
        }),
      ],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toBeNull();
  });

  it("returns null for a Send Prompt chat chain that can complete", () => {
    seedWorkflowGraph({
      sections: [
        {
          sectionId: "start-a",
          variantId: "variant-start-a",
          impl: createStateMachineStartSectionImpl(
            {},
            {
              id: "impl-start-a",
              name: "Start A",
              machineGroupId: "workflow-main",
              label: "Start A",
            },
          ),
        },
        {
          sectionId: "chat-a",
          variantId: "variant-chat-a",
          impl: createChatWorkflowImpl({
            implId: "impl-chat-a",
            name: "Review Chat",
          }),
        },
        {
          sectionId: "end-a",
          variantId: "variant-end-a",
          impl: createEndSectionImpl({
            implId: "impl-end-a",
            machineGroupId: "workflow-main",
            name: "End A",
          }),
        },
      ],
      edges: [
        createWorkflowEdge({
          id: "edge-start-chat",
          machineGroupId: "workflow-main",
          sourceSectionId: "start-a",
          sourcePortId: "workflow-source",
          targetSectionId: "chat-a",
          targetPortId: "workflow-target",
          targetAction: {
            type: "send_prompt",
            promptTemplateId: null,
            inlinePrompt: "Review this branch.",
            threadStrategy: "new_thread_before_send",
            stopIfRunning: false,
            engineConfigId: null,
            agentProfileId: null,
            permissionMode: null,
            searchEnabled: null,
          },
        }),
        createWorkflowEdge({
          id: "edge-chat-end",
          machineGroupId: "workflow-main",
          sourceSectionId: "chat-a",
          sourcePortId: "workflow-source",
          targetSectionId: "end-a",
          targetPortId: "workflow-target",
          sourceFilter: {
            type: "run_completed",
            signalName: null,
            payloadField: null,
            equals: null,
          },
        }),
      ],
    });

    expect(
      getStateMachineDraftWarning(useProjectState.getState(), "workflow-main"),
    ).toBeNull();
  });
});
