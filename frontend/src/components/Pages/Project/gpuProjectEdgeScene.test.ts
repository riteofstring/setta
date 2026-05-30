import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/edges", () => ({
  toggleEdgeSelection: vi.fn(),
}));
vi.mock("state/actions/agenticEdges", () => ({
  toggleAgenticEdgeSelection: vi.fn(),
}));
vi.mock("state/actions/stateMachineEdges", () => {
  const workflowHandleIds = new Set([
    "workflow-source",
    "workflow-target",
    "workflow-reverse-start",
  ]);
  return {
    isWorkflowHandleId: vi.fn((handleId: string | null | undefined) =>
      workflowHandleIds.has(handleId ?? ""),
    ),
    toggleStateMachineEdgeSelection: vi.fn(),
  };
});

import { HandlePosition } from "gpuFlow/flowTypes";
import type { GpuFlowPortDescriptor } from "gpuFlow/ports/portGeometry";
import { createGpuFlowViewportStore } from "gpuFlow/viewportStore";
import { toggleAgenticEdgeSelection } from "state/actions/agenticEdges";
import { toggleEdgeSelection } from "state/actions/edges";
import { toggleStateMachineEdgeSelection } from "state/actions/stateMachineEdges";
import {
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createChatSectionImpl,
  createProjectConfig,
  createTopLevelSectionLayout,
  createVariant,
  type Edge,
  type SingleConfig,
} from "utils/generatedTypes";
import type { BuildProjectGpuEdgeSceneInput } from "./gpuProjectEdgeScene";
import {
  buildProjectGpuEdgeScene,
  selectProjectGpuConnectionState,
  selectProjectGpuEdge,
} from "./gpuProjectEdgeScene";

type WorkflowEdge = NonNullable<
  SingleConfig["projectConfig"]["stateMachineEdges"]
>[number];

const toggleDataEdgeSelectionMock = vi.mocked(toggleEdgeSelection);
const toggleAgenticEdgeSelectionMock = vi.mocked(toggleAgenticEdgeSelection);
const toggleWorkflowEdgeSelectionMock = vi.mocked(
  toggleStateMachineEdgeSelection,
);

describe("gpuProjectEdgeScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives one GPU edge scene from project nodes, handles, connection, and edge state", () => {
    const scene = buildProjectGpuEdgeScene(
      createBuildInput({
        connectionState: {
          connectionPosition: { x: 450, y: 220 },
          connectionStartHandle: {
            handleId: "out",
            sectionId: "source",
            type: "source",
          },
          connectionStatus: "valid",
          transform: [10, 20, 2],
        },
        projectConfig: createProjectConfig({
          agenticEdges: [
            createAgenticEdge({
              id: "agentic-edge",
              kind: AgenticEdgeKindEnum.chat_chat,
              sourceSectionId: "source",
              targetSectionId: "target",
            }),
          ],
          edges: [
            createDataEdge({
              id: "data-edge",
              label: "arg",
              sourcePortId: "out",
              targetPortId: "in",
            }),
          ],
          sectionVariantMap: {
            source: "source-variant",
            target: "target-variant",
          },
          stateMachineEdges: [
            createWorkflowEdge({
              id: "workflow-edge",
              sourceActivationCountCondition: {
                operator: "gte",
                value: 3,
              },
              sourceSectionId: "source",
              targetSectionId: "target",
            }),
          ],
          topLevelSections: {
            source: createTopLevelSectionLayout({ h: 80, w: 120 }),
            target: createTopLevelSectionLayout({ h: 90, w: 160 }),
          },
        }),
      }),
    );

    expect(scene.entries.map((entry) => entry.edgeId)).toEqual([
      "data:data-edge",
      "agentic:agentic-edge",
      "workflow:workflow-edge",
      "connection:active",
    ]);
    expect(
      scene.entries.find((entry) => entry.family === "agentic"),
    ).toMatchObject({
      active: true,
      sourceEdgeId: "agentic-edge",
      visualFamily: "agentic",
    });
    expect(
      scene.entries.find((entry) => entry.family === "connection")?.geometry
        .target,
    ).toEqual({ x: 220, y: 100 });
    expect(
      scene.entries.find((entry) => entry.family === "connection"),
    ).toMatchObject({
      connectionStatus: "valid",
    });
    expect(
      scene.entries.find((entry) => entry.family === "workflow"),
    ).toMatchObject({
      sourceEdgeId: "workflow-edge",
      visualFamily: "workflow",
    });
    expect(scene.hitTestEdges.map((entry) => entry.edgeId)).toEqual([
      "data:data-edge",
      "agentic:agentic-edge",
      "workflow:workflow-edge",
    ]);
    expect(scene.labels).toEqual([
      expect.objectContaining({
        edgeId: "data-edge",
        kind: "data-edge-label",
        text: "arg",
      }),
      expect.objectContaining({
        edgeId: "workflow-edge",
        kind: "workflow-source-activation",
        text: "src count >= 3",
      }),
    ]);
  });

  it("honors project edge visibility flags before building GPU entries", () => {
    const hiddenScene = buildProjectGpuEdgeScene(
      createBuildInput({
        connectionState: {
          connectionPosition: { x: 450, y: 220 },
          connectionStartHandle: {
            handleId: "out",
            sectionId: "source",
            type: "source",
          },
          connectionStatus: "invalid",
          transform: [0, 0, 1],
        },
        projectConfig: createProjectConfig({
          agenticEdges: [
            createAgenticEdge({
              id: "agentic-edge",
              sourceSectionId: "source",
              targetSectionId: "target",
            }),
          ],
          edges: [createDataEdge({ id: "data-edge" })],
          sectionVariantMap: {
            source: "source-variant",
            target: "target-variant",
          },
          stateMachineEdges: [createWorkflowEdge({ id: "workflow-edge" })],
          topLevelSections: {
            source: createTopLevelSectionLayout({ h: 80, w: 120 }),
            target: createTopLevelSectionLayout({ h: 90, w: 160 }),
          },
        }),
        showAgenticEdges: false,
        showDataEdges: false,
      }),
    );

    expect(hiddenScene.entries.map((entry) => entry.edgeId)).toEqual([
      "workflow:workflow-edge",
    ]);

    const workflowConnectionScene = buildProjectGpuEdgeScene(
      createBuildInput({
        connectionState: {
          connectionPosition: { x: 450, y: 220 },
          connectionStartHandle: {
            handleId: "workflow-source",
            sectionId: "source",
            type: "source",
          },
          connectionStatus: null,
          transform: [0, 0, 1],
        },
        showAgenticEdges: false,
        showDataEdges: false,
      }),
    );

    expect(
      workflowConnectionScene.entries.map((entry) => entry.edgeId),
    ).toEqual(["connection:active"]);
  });

  it("routes selectable GPU edge hits to the matching project selection action", () => {
    expect(
      selectProjectGpuEdge({
        canEditStructure: true,
        event: { edgeId: "data-edge", family: "data" },
        multiSelect: true,
      }),
    ).toBe("data");
    expect(toggleDataEdgeSelectionMock).toHaveBeenCalledWith("data-edge", true);

    expect(
      selectProjectGpuEdge({
        canEditStructure: true,
        event: { edgeId: "agentic-edge", family: "agentic" },
        multiSelect: false,
      }),
    ).toBe("agentic");
    expect(toggleAgenticEdgeSelectionMock).toHaveBeenCalledWith(
      "agentic-edge",
      false,
    );

    expect(
      selectProjectGpuEdge({
        canEditStructure: true,
        event: { edgeId: "workflow-edge", family: "workflow" },
        multiSelect: false,
      }),
    ).toBe("workflow");
    expect(toggleWorkflowEdgeSelectionMock).toHaveBeenCalledWith(
      "workflow-edge",
      false,
    );
  });

  it("does not route read-only structural edge hits or nonselectable edge families", () => {
    expect(
      selectProjectGpuEdge({
        canEditStructure: false,
        event: { edgeId: "agentic-edge", family: "agentic" },
        multiSelect: false,
      }),
    ).toBe("none");
    expect(toggleAgenticEdgeSelectionMock).not.toHaveBeenCalled();

    expect(
      selectProjectGpuEdge({
        canEditStructure: true,
        event: { edgeId: "missing-edge", family: "agentic-missing" },
        multiSelect: false,
      }),
    ).toBe("none");
    expect(toggleDataEdgeSelectionMock).not.toHaveBeenCalled();
    expect(toggleWorkflowEdgeSelectionMock).not.toHaveBeenCalled();
  });

  it("keeps inactive connection state stable across viewport-only changes", () => {
    const store = createGpuFlowViewportStore();
    const inactiveState = selectProjectGpuConnectionState(store.getState());

    store.getState().setTransform({ x: 100, y: 80, zoom: 2 });

    expect(selectProjectGpuConnectionState(store.getState())).toBe(
      inactiveState,
    );
  });

  it("tracks viewport changes while a connection preview is active", () => {
    const store = createGpuFlowViewportStore();
    store.getState().setConnectionState({
      connectionPosition: { x: 450, y: 220 },
      connectionStartHandle: {
        handleId: "out",
        sectionId: "source",
        type: "source",
      },
      connectionStatus: "invalid",
    });
    const activeState = selectProjectGpuConnectionState(store.getState());

    store.getState().setTransform({ x: 100, y: 80, zoom: 2 });

    expect(selectProjectGpuConnectionState(store.getState())).not.toBe(
      activeState,
    );
    expect(selectProjectGpuConnectionState(store.getState()).transform).toEqual(
      [100, 80, 2],
    );
    expect(
      selectProjectGpuConnectionState(store.getState()).connectionStatus,
    ).toBe("invalid");
  });

  it("tracks connection status changes while a connection preview is active", () => {
    const store = createGpuFlowViewportStore();
    store.getState().setConnectionState({
      connectionPosition: { x: 450, y: 220 },
      connectionStartHandle: {
        handleId: "out",
        sectionId: "source",
        type: "source",
      },
      connectionStatus: "invalid",
    });
    const invalidState = selectProjectGpuConnectionState(store.getState());

    store.getState().setConnectionState({ connectionStatus: "valid" });

    expect(selectProjectGpuConnectionState(store.getState())).not.toBe(
      invalidState,
    );
    expect(
      selectProjectGpuConnectionState(store.getState()).connectionStatus,
    ).toBe("valid");
  });

  it("derives node-frame edge geometry from live layout-store nodes", () => {
    const scene = buildProjectGpuEdgeScene(
      createBuildInput({
        layoutNodes: [
          {
            height: 80,
            nodeId: "source",
            width: 120,
            x: 250,
            y: 300,
          },
          {
            height: 90,
            nodeId: "target",
            width: 160,
            x: 600,
            y: 315,
          },
        ],
        projectConfig: createProjectConfig({
          agenticEdges: [
            createAgenticEdge({
              id: "agentic-edge",
              kind: AgenticEdgeKindEnum.chat_chat,
              sourceSectionId: "source",
              targetSectionId: "target",
            }),
          ],
          sectionVariantMap: {
            source: "source-variant",
            target: "target-variant",
          },
          topLevelSections: {
            source: createTopLevelSectionLayout({
              h: 80,
              w: 120,
              x: 10,
              y: 20,
            }),
            target: createTopLevelSectionLayout({
              h: 90,
              w: 160,
              x: 30,
              y: 40,
            }),
          },
        }),
      }),
    );

    expect(scene.entries).toHaveLength(1);
    expect(scene.entries[0]).toMatchObject({
      edgeId: "agentic:agentic-edge",
      geometry: {
        source: { x: 370, y: 340 },
        target: { x: 600, y: 360 },
      },
    });
  });
});

function createBuildInput(
  overrides: Partial<BuildProjectGpuEdgeSceneInput> = {},
): BuildProjectGpuEdgeSceneInput {
  return {
    connectionState: {
      connectionPosition: { x: 0, y: 0 },
      connectionStartHandle: null,
      connectionStatus: null,
      transform: [0, 0, 1],
    },
    portDescriptors: {
      "source:out:source": {
        localRect: { height: 0, width: 0, x: 120, y: 40 },
        nodeId: "source",
        portId: "out",
        side: HandlePosition.Right,
        type: "source",
      },
      "source:workflow-source:source": {
        localRect: { height: 0, width: 0, x: 120, y: 40 },
        nodeId: "source",
        portId: "workflow-source",
        side: HandlePosition.Right,
        type: "source",
      },
      "target:in:target": {
        localRect: { height: 0, width: 0, x: 0, y: 45 },
        nodeId: "target",
        portId: "in",
        side: HandlePosition.Left,
        type: "target",
      },
    } satisfies Record<string, GpuFlowPortDescriptor>,
    layoutNodes: [
      {
        height: 80,
        nodeId: "source",
        tempZIndex: 0,
        width: 120,
        x: 100,
        y: 100,
        zIndex: 0,
      },
      {
        height: 90,
        nodeId: "target",
        tempZIndex: 0,
        width: 160,
        x: 420,
        y: 115,
        zIndex: 0,
      },
    ],
    projectConfig: createProjectConfig({
      sectionVariantMap: {
        source: "source-variant",
        target: "target-variant",
      },
    }),
    scopeViolationEdges: [],
    sectionImpls: {
      "source-impl": createChatSectionImpl({
        id: "source-impl",
        waitingForResponse: true,
      }),
      "target-impl": createChatSectionImpl({
        id: "target-impl",
        waitingForResponse: false,
      }),
    },
    sectionVariants: {
      "source-variant": createVariant({
        id: "source-variant",
        impl: "source-impl",
        name: "source",
      }),
      "target-variant": createVariant({
        id: "target-variant",
        impl: "target-impl",
        name: "target",
      }),
    },
    showAgenticEdges: true,
    showDataEdges: true,
    ...overrides,
  };
}

function createDataEdge(options: Partial<Edge> = {}): Edge {
  return {
    id: "data-edge",
    sourcePortId: "out",
    sourceSectionId: "source",
    sourceVariantId: "source-variant",
    targetPortId: "in",
    targetSectionId: "target",
    targetVariantId: "target-variant",
    zIndex: 0,
    ...options,
  };
}

function createWorkflowEdge(options: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return {
    hidden: false,
    id: "workflow-edge",
    machineGroupId: "machine",
    selected: false,
    sourceActivationCountCondition: null,
    sourceFilter: null,
    sourcePortId: "workflow-source",
    sourceSectionId: "source",
    style: null,
    targetAction: null,
    targetPortId: "workflow-target",
    targetSectionId: "target",
    zIndex: 0,
    ...options,
  };
}
