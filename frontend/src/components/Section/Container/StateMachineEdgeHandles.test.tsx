import { NodeIdContext } from "gpuFlow/NodeIdContext";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "utils/constants";
import {
  SectionTypeEnum,
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createSectionSize,
  createVariant,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StateMachineEdgeHandles } from "./StateMachineEdgeHandles";

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

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"];
type WorkflowEdgeItem = NonNullable<WorkflowEdge>[number];

function seedWorkflowSection({
  sectionId,
  variantId,
  impl,
  edges = [],
}: {
  sectionId: string;
  variantId: string;
  impl: BaseSectionImplUnion;
  edges?: WorkflowEdgeItem[];
}): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionId]: variantId,
      },
      stateMachineEdges: edges,
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: impl.name,
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: `${sectionId} Variant`,
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

function seedWorkflowSectionWithoutImpl({
  sectionId,
  variantId,
  implId,
  edges = [],
}: {
  sectionId: string;
  variantId: string;
  implId: string;
  edges?: WorkflowEdgeItem[];
}): void {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: {
        [sectionId]: variantId,
      },
      stateMachineEdges: edges,
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Missing Impl Node",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: `${sectionId} Variant`,
        impl: implId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {};
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
}

function renderEdgeHandles(
  sectionId: string,
  isUserView: boolean = false,
): string {
  return renderToStaticMarkup(
    <NodeIdContext.Provider value={sectionId}>
      <StateMachineEdgeHandles isUserView={isUserView} />
    </NodeIdContext.Provider>,
  );
}

describe("StateMachineEdgeHandles", () => {
  beforeEach(() => {
    resetProjectStores();
    gpuFlowViewportStore.getState().cancelConnection();
  });

  afterEach(() => {
    resetProjectStores();
    gpuFlowViewportStore.getState().cancelConnection();
  });

  it("renders only a source handle on workflow start nodes", () => {
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

    const markup = renderEdgeHandles("section-start");

    expect(markup).toContain(
      'data-testid="workflow-source-handle-section-start"',
    );
    expect(markup).not.toContain("workflow-target-handle-section-start");
    expect(markup).not.toContain("workflow-reverse-start-handle-section-start");
  });

  it("renders only target handles on workflow end nodes", () => {
    seedWorkflowSection({
      sectionId: "section-end",
      variantId: "variant-end",
      impl: {
        id: "impl-end",
        type: SectionTypeEnum.StateMachineEnd,
        name: "End Node",
        size: createSectionSize({ width: 240, height: 96 }),
        machineGroupId: "workflow-main",
        label: "Done",
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });

    const markup = renderEdgeHandles("section-end");

    expect(markup).toContain(
      'data-testid="workflow-target-handle-section-end"',
    );
    expect(markup).toContain(
      'data-testid="workflow-reverse-start-handle-section-end"',
    );
    expect(markup).not.toContain("workflow-source-handle-section-end");
  });

  it("renders both sides for chat nodes and marks connected handles", () => {
    seedWorkflowSection({
      sectionId: "section-chat",
      variantId: "variant-chat",
      impl: createChatSectionImpl({
        id: "impl-chat",
        name: "Chat Node",
      }),
      edges: [
        {
          id: "edge-incoming",
          machineGroupId: "workflow-main",
          sourceSectionId: "section-other",
          sourcePortId: "workflow-source",
          targetSectionId: "section-chat",
          targetPortId: "workflow-target",
          sourceFilter: null,
          targetAction: null,
          style: null,
          hidden: false,
          zIndex: 0,
          selected: false,
        },
        {
          id: "edge-outgoing",
          machineGroupId: "workflow-main",
          sourceSectionId: "section-chat",
          sourcePortId: "workflow-source",
          targetSectionId: "section-next",
          targetPortId: "workflow-target",
          sourceFilter: null,
          targetAction: null,
          style: null,
          hidden: false,
          zIndex: 0,
          selected: false,
        },
      ],
    });

    const markup = renderEdgeHandles("section-chat");

    expect(markup).toContain(
      'data-testid="workflow-source-handle-section-chat"',
    );
    expect(markup).toContain(
      'data-testid="workflow-target-handle-section-chat"',
    );
    expect(markup).toContain(
      'data-testid="workflow-reverse-start-handle-section-chat"',
    );
    expect(markup).toContain("agentic-handle--connected");
    expect(markup).toContain("workflow-handle-scope--chat");
    expect(markup).toMatch(
      new RegExp(
        `class="[^"]*${NO_DRAG_CLASS_NAME}[^"]*${NO_PAN_CLASS_NAME}[^"]*workflow-handle-safe-zone`,
      ),
    );
  });

  it("suppresses workflow handles in user view", () => {
    seedWorkflowSection({
      sectionId: "section-gate",
      variantId: "variant-gate",
      impl: {
        id: "impl-gate",
        type: SectionTypeEnum.StateMachineGate,
        name: "Gate Node",
        size: createSectionSize({ width: 240, height: 120 }),
        machineGroupId: "workflow-main",
        gateType: "AND",
        label: "Review Gate",
        ui: { showDetails: false },
        ...COMMON_MACHINE_IMPL_FIELDS,
      },
    });

    const markup = renderEdgeHandles("section-gate", true);

    expect(markup).toBe("");
  });

  it("suppresses workflow handles when the section implementation is missing", () => {
    seedWorkflowSectionWithoutImpl({
      sectionId: "section-missing-impl",
      variantId: "variant-missing-impl",
      implId: "impl-missing-impl",
      edges: [
        {
          id: "edge-outgoing",
          machineGroupId: "workflow-main",
          sourceSectionId: "section-missing-impl",
          sourcePortId: "workflow-source",
          targetSectionId: "section-next",
          targetPortId: "workflow-target",
          sourceFilter: null,
          targetAction: null,
          style: null,
          hidden: false,
          zIndex: 0,
          selected: false,
        },
      ],
    });

    const markup = renderEdgeHandles("section-missing-impl");

    expect(markup).toBe("");
  });
});
