import { renderToStaticMarkup } from "react-dom/server";
import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgentRunStatusEnum,
  SectionTypeEnum,
  StateMachineGateTypeEnum,
  createAgentRun,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createSectionSize,
  createUserDefaultChatSectionImpl,
  createVariant,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StateMachineNodeArea } from "./StateMachineNodeArea";

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

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}): void {
  if (!store.getInitialState) {
    return;
  }
  const initialState = store.getInitialState();
  Object.assign(initialState, store.getState());
}

function seedWorkflowSection({
  sectionId,
  variantId,
  impl,
}: {
  sectionId: string;
  variantId: string;
  impl: BaseSectionImplUnion;
}): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionId]: variantId,
      },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Workflow Node",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: "Workflow Variant",
        impl: impl.id,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      [impl.id]: impl,
    };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
}

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];

function seedWorkflowGraph({
  edges,
  sections,
}: {
  edges: WorkflowEdge[];
  sections: Array<{
    sectionId: string;
    variantId: string;
    impl: BaseSectionImplUnion;
  }>;
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
      name: section.impl.name,
      variants: [section.variantId],
      defaultVariant: section.variantId,
    });
    seededVariants[section.variantId] = createVariant({
      id: section.variantId,
      name: `${section.sectionId} Variant`,
      impl: section.impl.id,
      nonPresetImpls: [],
    });
    seededImpls[section.impl.id] = section.impl;
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
  syncStoreInitialState(useProjectState);
}

describe("StateMachineNodeArea", () => {
  beforeEach(() => {
    resetProjectStores();
    useAIStore.setState({
      agentRuns: [],
      agentRunsAuthorityState: "ready",
      agentRunsInitialLoadComplete: true,
      agentRunsLoadError: null,
    });
    syncStoreInitialState(useAIStore);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders idle controls on start nodes", () => {
    seedWorkflowSection({
      sectionId: "section-start",
      variantId: "variant-start",
      impl: {
        id: "impl-start",
        type: SectionTypeEnum.StateMachineStart,
        name: "Start Node",
        size: createSectionSize({ width: 240, height: 96 }),
        machineGroupId: "workflow-main",
        label: "Kickoff",
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-start" />,
    );

    expect(markup).toContain("Kickoff");
    expect(markup).toContain("workflow-main");
    expect(markup).toContain("Idle");
    expect(markup).toContain(
      'data-testid="state-machine-start-button-section-start"',
    );
    expect(markup).toContain(
      'data-testid="state-machine-stop-button-section-start"',
    );
    expect(markup).toContain(
      'data-testid="state-machine-reset-button-section-start"',
    );
  });

  it("renders gate status without start controls when a workflow is running", () => {
    seedWorkflowSection({
      sectionId: "section-gate",
      variantId: "variant-gate",
      impl: {
        id: "impl-gate",
        type: SectionTypeEnum.StateMachineGate,
        name: "Gate Node",
        size: createSectionSize({ width: 240, height: 120 }),
        machineGroupId: "workflow-main",
        gateType: StateMachineGateTypeEnum.AND,
        label: "Review Gate",
        ui: { showDetails: false },
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "machine-run-1",
          status: AgentRunStatusEnum.running,
          startedAt: "2024-01-01T00:00:00Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          outputs: {
            stateMachineIteration: 1,
            gateIncomingEdgeIdsBySectionId: {
              "section-gate": ["edge-a", "edge-b", "edge-c"],
            },
            gateInputEdgeIdsBySectionId: {
              "section-gate": ["edge-a", "edge-b", "edge-c"],
            },
            gateStatusBySectionId: {
              "section-gate": "satisfied",
            },
          },
          events: [
            {
              id: "event-gate-1",
              timestamp: "2024-01-01T00:00:00Z",
              type: "gate_input_activated",
              payload: {
                gateSectionId: "section-gate",
              },
            },
            {
              id: "event-gate-2",
              timestamp: "2024-01-01T00:00:01Z",
              type: "gate_input_activated",
              payload: {
                gateSectionId: "section-gate",
              },
            },
            {
              id: "event-gate-3",
              timestamp: "2024-01-01T00:00:02Z",
              type: "gate_satisfied",
              payload: {
                gateSectionId: "section-gate",
              },
            },
          ],
        }),
      ],
    });
    syncStoreInitialState(useAIStore);

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-gate" />,
    );

    expect(markup).toContain("Review Gate");
    expect(markup).toContain("Running");
    expect(markup).toContain("Satisfied");
    expect(markup).toContain("Gate satisfied");
    expect(markup).toContain("3 / 3");
    expect(markup).toContain(
      'data-testid="state-machine-run-status-section-gate"',
    );
    expect(markup).toContain(
      'data-testid="state-machine-gate-status-section-gate"',
    );
    expect(markup).toContain(
      'data-testid="state-machine-gate-input-progress-section-gate"',
    );
    expect(markup).toContain(
      'data-testid="state-machine-activity-panel-section-gate"',
    );
    expect(markup).not.toContain(
      'data-testid="state-machine-start-button-section-gate"',
    );
  });

  it("shows a small draft warning on gate nodes that are missing workflow endpoints", () => {
    seedWorkflowSection({
      sectionId: "section-gate-warning",
      variantId: "variant-gate-warning",
      impl: {
        id: "impl-gate-warning",
        type: SectionTypeEnum.StateMachineGate,
        name: "Gate Warning Node",
        size: createSectionSize({ width: 240, height: 120 }),
        machineGroupId: "workflow-main",
        gateType: StateMachineGateTypeEnum.AND,
        label: "Draft Gate",
        ui: { showDetails: false },
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-gate-warning" />,
    );

    expect(markup).toContain(
      'data-testid="state-machine-draft-warning-section-gate-warning"',
    );
    expect(markup).toContain('aria-label="Workflow draft warning"');
  });

  it("shows the warning badge on start nodes when the workflow cannot reach End", () => {
    seedWorkflowGraph({
      sections: [
        {
          sectionId: "section-start-warning",
          variantId: "variant-start-warning",
          impl: {
            id: "impl-start-warning",
            type: SectionTypeEnum.StateMachineStart,
            name: "Start Warning Node",
            size: createSectionSize({ width: 240, height: 96 }),
            machineGroupId: "workflow-main",
            label: "Kickoff",
            maxIterations: null,
            ...COMMON_MACHINE_IMPL_FIELDS,
          },
        },
        {
          sectionId: "section-chat-warning",
          variantId: "variant-chat-warning",
          impl: createChatSectionImpl(createUserDefaultChatSectionImpl(), {
            id: "impl-chat-warning",
            name: "Review Chat",
          }),
        },
        {
          sectionId: "section-end-warning",
          variantId: "variant-end-warning",
          impl: {
            id: "impl-end-warning",
            type: SectionTypeEnum.StateMachineEnd,
            name: "End Warning Node",
            size: createSectionSize({ width: 240, height: 96 }),
            machineGroupId: "workflow-main",
            label: "Done",
            ...COMMON_MACHINE_IMPL_FIELDS,
          },
        },
      ],
      edges: [
        {
          id: "edge-start-chat-warning",
          machineGroupId: "workflow-main",
          sourceSectionId: "section-start-warning",
          sourcePortId: "workflow-source",
          targetSectionId: "section-chat-warning",
          targetPortId: "workflow-target",
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
        {
          id: "edge-chat-end-warning",
          machineGroupId: "workflow-main",
          sourceSectionId: "section-chat-warning",
          sourcePortId: "workflow-source",
          targetSectionId: "section-end-warning",
          targetPortId: "workflow-target",
          sourceFilter: {
            type: "run_completed",
            signalName: null,
            payloadField: null,
            equals: null,
          },
          targetAction: null,
          style: null,
          hidden: false,
          zIndex: 0,
          selected: false,
        },
      ],
    });

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-start-warning" />,
    );

    expect(markup).toContain(
      'data-testid="state-machine-draft-warning-section-start-warning"',
    );
    expect(markup).toContain("Kickoff");
  });

  it("renders recent workflow activity on start nodes", () => {
    seedWorkflowSection({
      sectionId: "section-start-activity",
      variantId: "variant-start-activity",
      impl: {
        id: "impl-start-activity",
        type: SectionTypeEnum.StateMachineStart,
        name: "Start Activity Node",
        size: createSectionSize({ width: 260, height: 120 }),
        machineGroupId: "workflow-main",
        label: "Kickoff",
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "machine-run-activity",
          status: AgentRunStatusEnum.cancelled,
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: "2024-01-01T00:00:02Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          outputs: {},
          events: [
            {
              id: "event-start-1",
              timestamp: "2024-01-01T00:00:00Z",
              type: "run_started",
              payload: {},
            },
            {
              id: "event-start-2",
              timestamp: "2024-01-01T00:00:01Z",
              type: "signal_reported",
              payload: {
                signalName: "merge_decision",
              },
            },
            {
              id: "event-start-3",
              timestamp: "2024-01-01T00:00:02Z",
              type: "run_cancelled",
              payload: {},
            },
          ],
        }),
      ],
    });
    syncStoreInitialState(useAIStore);

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-start-activity" />,
    );

    expect(markup).toContain("Workflow started");
    expect(markup).toContain("Signal merge_decision reported");
    expect(markup).toContain("Workflow stopped");
    expect(markup).toContain(
      'data-testid="state-machine-activity-panel-section-start-activity"',
    );
  });

  it("returns start nodes to idle after a workflow reset clears the latest run", () => {
    seedWorkflowSection({
      sectionId: "section-start-reset",
      variantId: "variant-start-reset",
      impl: {
        id: "impl-start-reset",
        type: SectionTypeEnum.StateMachineStart,
        name: "Reset Start Node",
        size: createSectionSize({ width: 260, height: 120 }),
        machineGroupId: "workflow-main",
        label: "Kickoff",
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "machine-run-reset",
          status: AgentRunStatusEnum.cancelled,
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: "2024-01-01T00:00:03Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          outputs: {
            machineStateCleared: true,
            machineStateClearedAt: "2024-01-01T00:00:03Z",
          },
          events: [
            {
              id: "event-reset-1",
              timestamp: "2024-01-01T00:00:03Z",
              type: "run_reset",
              payload: {},
            },
          ],
        }),
      ],
    });
    syncStoreInitialState(useAIStore);

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-start-reset" />,
    );

    expect(markup).toContain("Idle");
    expect(markup).not.toContain(
      'data-testid="state-machine-activity-panel-section-start-reset"',
    );
  });

  it("renders a workflow failure summary ahead of generic failure activity", () => {
    seedWorkflowSection({
      sectionId: "section-start-failed",
      variantId: "variant-start-failed",
      impl: {
        id: "impl-start-failed",
        type: SectionTypeEnum.StateMachineStart,
        name: "Failed Start Node",
        size: createSectionSize({ width: 260, height: 120 }),
        machineGroupId: "workflow-main",
        label: "Kickoff",
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });
    useAIStore.setState({
      agentRuns: [
        createAgentRun({
          id: "machine-run-failed",
          status: AgentRunStatusEnum.failed,
          startedAt: "2024-01-01T00:00:00Z",
          finishedAt: "2024-01-01T00:00:03Z",
          inputs: {
            runType: "state_machine",
            projectConfigId: "project-1",
            machineGroupId: "workflow-main",
          },
          outputs: {
            failureSummary: {
              reason: "run_blocked",
              message: "Workflow blocked at gate Review Gate.",
              details: {},
            },
          },
          events: [
            {
              id: "event-failed-1",
              timestamp: "2024-01-01T00:00:01Z",
              type: "run_blocked",
              payload: {},
            },
            {
              id: "event-failed-2",
              timestamp: "2024-01-01T00:00:02Z",
              type: "run_failed",
              payload: {},
            },
          ],
        }),
      ],
    });
    syncStoreInitialState(useAIStore);

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-start-failed" />,
    );

    expect(markup).toContain("Failed");
    expect(markup).toContain("Workflow blocked at gate Review Gate.");
    expect(markup).toContain("Workflow blocked");
    expect(markup).toContain("Workflow failed");
  });
});
