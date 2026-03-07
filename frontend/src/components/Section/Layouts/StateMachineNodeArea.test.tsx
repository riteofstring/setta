import { renderToStaticMarkup } from "react-dom/server";
import { useAIStore, useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  AgentRunStatusEnum,
  SectionTypeEnum,
  StateMachineGateTypeEnum,
  createAgentRun,
  createCore,
  createProjectConfig,
  createSectionSize,
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
        }),
      ],
    });
    syncStoreInitialState(useAIStore);

    const markup = renderToStaticMarkup(
      <StateMachineNodeArea sectionId="section-gate" />,
    );

    expect(markup).toContain("Review Gate");
    expect(markup).toContain("Running");
    expect(markup).toContain(
      'data-testid="state-machine-run-status-section-gate"',
    );
    expect(markup).not.toContain(
      'data-testid="state-machine-start-button-section-gate"',
    );
  });
});
