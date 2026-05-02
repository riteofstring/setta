import {
  AgenticEdgeKindEnum,
  createAgenticEdge,
  createTopLevelSectionLayout,
  type Edge,
  type SingleConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildGpuAgenticEdgeEntries,
  buildGpuConnectionLineEntries,
  buildGpuDataEdgeEntries,
  buildGpuEdgeScene,
  buildGpuWorkflowEdgeEntries,
  hitTestGpuEdgeScene,
  type GpuEdgeHandlePosition,
  type GpuEdgeNodeFrame,
} from "./edgeSources";

type WorkflowEdge = SingleConfig["projectConfig"]["stateMachineEdges"][number];

describe("edgeSources", () => {
  it("derives data edges from active variants and registered handle positions", () => {
    const handlePositions = createHandlePositions([
      {
        portId: "out",
        sectionId: "source",
        side: "right",
        type: "source",
        x: 140,
        y: 80,
      },
      {
        portId: "in",
        sectionId: "target",
        side: "left",
        type: "target",
        x: 260,
        y: 80,
      },
    ]);
    const entries = buildGpuDataEdgeEntries({
      edges: [
        createDataEdge({
          id: "edge-a",
          selected: true,
          sourcePortId: "out",
          sourceSectionId: "source",
          sourceVariantId: "source-variant",
          targetPortId: "in",
          targetSectionId: "target",
          targetVariantId: "target-variant",
          type: "straight",
          zIndex: 5,
        }),
        createDataEdge({
          id: "edge-inactive-variant",
          sourceVariantId: "old-source-variant",
        }),
        createDataEdge({
          hidden: true,
          id: "edge-hidden",
        }),
      ],
      handlePositions,
      sectionVariantMap: {
        source: "source-variant",
        target: "target-variant",
      },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      edgeId: "data:edge-a",
      family: "data",
      selectable: true,
      selected: true,
      sourceEdgeId: "edge-a",
      zIndex: 5,
    });
    expect(entries[0]?.geometry).toMatchObject({
      kind: "straight",
      source: { x: 140, y: 80 },
      target: { x: 260, y: 80 },
    });
  });

  it("derives agentic and shared-chat edges from node frames with missing-edge dedupe", () => {
    const nodes = new Map<string, GpuEdgeNodeFrame>([
      ["chat-a", { height: 100, width: 180, x: 50, y: 40 }],
      ["chat-b", { height: 100, width: 180, x: 360, y: 40 }],
      ["context", { height: null, width: null, x: 360, y: 220 }],
    ]);
    const topLevelSections = {
      context: createTopLevelSectionLayout({
        h: 120,
        w: 220,
        x: 360,
        y: 220,
      }),
    };

    const entries = buildGpuAgenticEdgeEntries({
      edges: [
        createAgenticEdge({
          id: "edge-chat-chat",
          kind: AgenticEdgeKindEnum.chat_chat,
          selected: true,
          sourceSectionId: "chat-b",
          targetSectionId: "chat-a",
          zIndex: 3,
        }),
        createAgenticEdge({
          hidden: true,
          id: "edge-hidden",
          sourceSectionId: "chat-a",
          targetSectionId: "context",
        }),
      ],
      nodes,
      runningSourceSectionIds: new Set(["chat-b"]),
      scopeViolationEdges: [
        {
          kind: AgenticEdgeKindEnum.chat_chat,
          sourceSectionId: "chat-a",
          targetSectionId: "chat-b",
        },
        {
          kind: AgenticEdgeKindEnum.chat_section,
          sourceSectionId: "chat-a",
          targetSectionId: "context",
        },
      ],
      topLevelSections,
    });

    expect(entries.map((entry) => entry.family)).toEqual([
      "agentic",
      "agentic-missing",
    ]);
    expect(entries[0]).toMatchObject({
      active: true,
      edgeId: "agentic:edge-chat-chat",
      selectable: true,
      selected: true,
      sourceEdgeId: "edge-chat-chat",
      zIndex: 3,
    });
    expect(entries[0]?.geometry).toMatchObject({
      kind: "bezier",
      source: { x: 540, y: 90 },
      sourceSide: "right",
      target: { x: 50, y: 90 },
      targetSide: "left",
    });
    expect(entries[1]).toMatchObject({
      active: true,
      edgeId: "agentic-missing:missing:chat_section:chat-a:context",
      selectable: false,
    });
    expect(entries[1]?.geometry).toMatchObject({
      source: { x: 230, y: 90 },
      target: { x: 360, y: 280 },
    });
  });

  it("derives workflow main edges and prompt-link geometry", () => {
    const nodes = new Map<string, GpuEdgeNodeFrame>([
      ["source", { height: 120, width: 200, x: 100, y: 80 }],
      ["target", { height: 120, width: 200, x: 460, y: 80 }],
      ["prompt", { height: 100, width: 160, x: 180, y: 280 }],
    ]);
    const entries = buildGpuWorkflowEdgeEntries({
      edges: [
        createWorkflowEdge({
          id: "workflow-a",
          selected: true,
          sourceSectionId: "source",
          targetAction: {
            agentProfileId: null,
            engineConfigId: null,
            inlinePrompt: null,
            permissionMode: null,
            promptInputs: {},
            promptSectionId: "prompt",
            promptTemplateId: null,
            searchEnabled: null,
            stopIfRunning: false,
            threadStrategy: "continue_current_thread",
            type: "send_prompt",
          },
          targetSectionId: "target",
          zIndex: 8,
        }),
        createWorkflowEdge({
          hidden: true,
          id: "workflow-hidden",
        }),
      ],
      nodes,
      topLevelSections: {},
    });

    expect(entries.map((entry) => entry.family)).toEqual([
      "workflow-prompt-link",
      "workflow",
    ]);
    expect(entries[0]).toMatchObject({
      edgeId: "workflow-prompt-link:workflow-a",
      selectable: false,
      sourceEdgeId: "workflow-a",
      zIndex: 8,
    });
    expect(entries[0]?.geometry).toMatchObject({
      source: { x: 340, y: 330 },
      sourceSide: "right",
      target: { x: 460, y: 140 },
      targetSide: "left",
    });
    expect(entries[1]).toMatchObject({
      edgeId: "workflow:workflow-a",
      selectable: true,
      selected: true,
    });
    expect(entries[1]?.geometry).toMatchObject({
      source: { x: 300, y: 140 },
      target: { x: 460, y: 140 },
    });
  });

  it("derives active connection line geometry from the registered start handle", () => {
    const handlePositions = createHandlePositions([
      {
        portId: "out",
        sectionId: "source",
        side: "right",
        type: "source",
        x: 120,
        y: 50,
      },
    ]);

    const entries = buildGpuConnectionLineEntries({
      connectionLine: {
        pointerFlowPosition: { x: 260, y: 80 },
        startHandle: {
          handleId: "out",
          sectionId: "source",
          type: "source",
        },
        status: "valid",
      },
      handlePositions,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      active: true,
      connectionStatus: "valid",
      edgeId: "connection:active",
      family: "connection",
      selectable: false,
      sourceEdgeId: "active",
    });
    expect(entries[0]?.geometry).toMatchObject({
      source: { x: 120, y: 50 },
      sourceSide: "right",
      target: { x: 260, y: 80 },
      targetSide: "left",
    });
  });

  it("exposes selectable entries for CPU edge hit testing", () => {
    const handlePositions = createHandlePositions([
      {
        portId: "out",
        sectionId: "source",
        side: "right",
        type: "source",
        x: 100,
        y: 50,
      },
      {
        portId: "in",
        sectionId: "target",
        side: "left",
        type: "target",
        x: 300,
        y: 50,
      },
    ]);
    const scene = buildGpuEdgeScene({
      connectionLine: {
        pointerFlowPosition: { x: 400, y: 80 },
        startHandle: {
          handleId: "out",
          sectionId: "source",
          type: "source",
        },
      },
      dataEdges: [
        createDataEdge({
          id: "edge-hit",
          sourcePortId: "out",
          sourceSectionId: "source",
          sourceVariantId: "source-variant",
          targetPortId: "in",
          targetSectionId: "target",
          targetVariantId: "target-variant",
          type: "straight",
        }),
      ],
      handlePositions,
      sectionVariantMap: {
        source: "source-variant",
        target: "target-variant",
      },
    });

    expect(scene.entries.map((entry) => entry.edgeId)).toEqual([
      "data:edge-hit",
      "connection:active",
    ]);
    expect(scene.hitTestEdges.map((entry) => entry.edgeId)).toEqual([
      "data:edge-hit",
    ]);
    expect(
      hitTestGpuEdgeScene({
        point: { x: 180, y: 52 },
        scene,
        tolerance: 8,
      }),
    ).toMatchObject({
      edgeId: "data:edge-hit",
      entry: {
        family: "data",
        sourceEdgeId: "edge-hit",
      },
    });
  });
});

function createHandlePositions(
  positions: readonly GpuEdgeHandlePosition[],
): Record<string, GpuEdgeHandlePosition> {
  return Object.fromEntries(
    positions.map((position) => [
      `${position.sectionId}:${position.portId}:${position.type}`,
      position,
    ]),
  );
}

function createDataEdge(options: Partial<Edge> = {}): Edge {
  return {
    id: "edge",
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
    id: "workflow",
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
