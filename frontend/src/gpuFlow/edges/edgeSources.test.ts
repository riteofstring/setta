import { describe, expect, it } from "vitest";
import {
  buildGpuAgenticEdgeEntries,
  buildGpuConnectionLineEntries,
  buildGpuDataEdgeEntries,
  buildGpuDataEdgeLabels,
  buildGpuDataEdgeReconnectAnchors,
  buildGpuEdgeScene,
  buildGpuWorkflowEdgeEntries,
  buildGpuWorkflowEdgeLabels,
  hitTestGpuEdgeScene,
  type GpuAgenticEdgeSource,
  type GpuAgenticMissingEdgeSource,
  type GpuDataEdgeSource,
  type GpuEdgeHandlePosition,
  type GpuEdgeNodeFrame,
  type GpuWorkflowEdgeSource,
} from "./edgeSources";

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
          style: { stroke: "#112233cc" },
          targetPortId: "in",
          targetSectionId: "target",
          type: "straight",
          zIndex: 5,
        }),
        createDataEdge({
          id: "edge-missing-handle",
          sourcePortId: "missing",
        }),
        createDataEdge({
          hidden: true,
          id: "edge-hidden",
        }),
      ],
      handlePositions,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      edgeId: "data:edge-a",
      family: "data",
      color: [17 / 255, 34 / 255, 51 / 255, 204 / 255],
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

  it("derives data edge labels from active edge metadata and geometry", () => {
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

    const labels = buildGpuDataEdgeLabels({
      edges: [
        createDataEdge({
          id: "edge-labeled",
          label: "count",
          sourcePortId: "out",
          sourceSectionId: "source",
          targetPortId: "in",
          targetSectionId: "target",
          zIndex: 4,
        }),
        createDataEdge({
          id: "edge-unlabeled",
          label: null,
        }),
        createDataEdge({
          id: "edge-missing-handle",
          label: "hidden by variant",
          sourcePortId: "missing",
        }),
      ],
      handlePositions,
    });

    expect(labels).toEqual([
      {
        edgeId: "edge-labeled",
        height: 18,
        id: "data-edge-label:edge-labeled",
        kind: "data-edge-label",
        text: "count",
        width: 46.5,
        x: 200,
        y: 50,
        zIndex: 4,
      },
    ]);
  });

  it("derives data edge reconnect anchors from active edge endpoints", () => {
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

    const anchors = buildGpuDataEdgeReconnectAnchors({
      edges: [
        createDataEdge({
          id: "edge-reconnect",
          sourcePortId: "out",
          sourceSectionId: "source",
          targetPortId: "in",
          targetSectionId: "target",
          zIndex: 6,
        }),
        createDataEdge({
          id: "edge-missing-handle",
          sourcePortId: "missing",
        }),
      ],
      handlePositions,
    });

    expect(anchors).toEqual([
      {
        edgeId: "edge-reconnect",
        endpoint: "source",
        fixedHandleId: "in",
        fixedHandleType: "target",
        fixedIsTarget: true,
        fixedSectionId: "target",
        id: "data-edge-reconnect:edge-reconnect:source",
        radius: 12,
        x: 112,
        y: 50,
        zIndex: 6,
      },
      {
        edgeId: "edge-reconnect",
        endpoint: "target",
        fixedHandleId: "out",
        fixedHandleType: "source",
        fixedIsTarget: false,
        fixedSectionId: "source",
        id: "data-edge-reconnect:edge-reconnect:target",
        radius: 12,
        x: 288,
        y: 50,
        zIndex: 6,
      },
    ]);
  });

  it("derives agentic and shared-chat edges from node frames with missing-edge dedupe", () => {
    const nodes = new Map<string, GpuEdgeNodeFrame>([
      ["chat-a", { height: 100, width: 180, x: 50, y: 40 }],
      ["chat-b", { height: 100, width: 180, x: 360, y: 40 }],
      ["context", { height: 120, width: 220, x: 360, y: 220 }],
    ]);

    const entries = buildGpuAgenticEdgeEntries({
      edges: [
        createAgenticEdgeSource({
          id: "edge-chat-chat",
          kind: "chat_chat",
          selected: true,
          sourceSectionId: "chat-b",
          style: { stroke: "#00ff00" },
          targetSectionId: "chat-a",
          zIndex: 3,
        }),
        createAgenticEdgeSource({
          hidden: true,
          id: "edge-hidden",
          kind: "hidden",
          sourceSectionId: "chat-a",
          targetSectionId: "context",
        }),
      ],
      nodes,
      runningSourceSectionIds: new Set(["chat-b"]),
      scopeViolationEdges: [
        createAgenticMissingEdgeSource({
          kind: "chat_chat",
          sourceSectionId: "chat-a",
          targetSectionId: "chat-b",
        }),
        createAgenticMissingEdgeSource({
          kind: "chat_section",
          sourceSectionId: "chat-a",
          targetSectionId: "context",
        }),
      ],
    });

    expect(entries.map((entry) => entry.family)).toEqual([
      "agentic",
      "agentic-missing",
    ]);
    expect(entries[0]).toMatchObject({
      active: true,
      color: [0, 1, 0, 1],
      edgeId: "agentic:edge-chat-chat",
      selectable: true,
      selected: true,
      sourceEdgeId: "edge-chat-chat",
      visualFamily: "agentic",
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
      edgeId: "agentic-missing:missing:chat_section:chat-a:context",
      selectable: false,
      visualFamily: "agentic-missing",
    });
    expect(entries[1]?.geometry).toMatchObject({
      source: { x: 230, y: 90 },
      target: { x: 360, y: 280 },
    });
  });

  it("omits node-anchor edges whose endpoints are missing from renderer frames", () => {
    const nodes = new Map<string, GpuEdgeNodeFrame>([
      ["chat-a", { height: 100, width: 180, x: 50, y: 40 }],
    ]);

    expect(
      buildGpuAgenticEdgeEntries({
        edges: [
          createAgenticEdgeSource({
            id: "missing-target",
            sourceSectionId: "chat-a",
            targetSectionId: "chat-b",
          }),
        ],
        nodes,
      }),
    ).toEqual([]);
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
          promptSectionId: "prompt",
          selected: true,
          sourceSectionId: "source",
          style: { stroke: "#abcdef" },
          targetSectionId: "target",
          zIndex: 8,
        }),
        createWorkflowEdge({
          hidden: true,
          id: "workflow-hidden",
        }),
      ],
      nodes,
    });

    expect(entries.map((entry) => entry.family)).toEqual([
      "workflow-prompt-link",
      "workflow",
    ]);
    expect(entries[0]).toMatchObject({
      edgeId: "workflow-prompt-link:workflow-a",
      selectable: false,
      sourceEdgeId: "workflow-a",
      visualFamily: "workflow-prompt-link",
      zIndex: 8,
    });
    expect(entries[0]?.color).toBeUndefined();
    expect(entries[0]?.geometry).toMatchObject({
      source: { x: 340, y: 330 },
      sourceSide: "right",
      target: { x: 460, y: 140 },
      targetSide: "left",
    });
    expect(entries[1]).toMatchObject({
      edgeId: "workflow:workflow-a",
      color: [171 / 255, 205 / 255, 239 / 255, 1],
      selectable: true,
      selected: true,
      visualFamily: "workflow",
    });
    expect(entries[1]?.geometry).toMatchObject({
      source: { x: 300, y: 140 },
      target: { x: 460, y: 140 },
    });
  });

  it("derives workflow source-activation labels from edge owner metadata", () => {
    const nodes = new Map<string, GpuEdgeNodeFrame>([
      ["source", { height: 120, width: 200, x: 100, y: 80 }],
      ["target", { height: 120, width: 200, x: 460, y: 80 }],
    ]);

    const labels = buildGpuWorkflowEdgeLabels({
      edges: [
        createWorkflowEdge({
          id: "workflow-threshold",
          sourceActivationLabel: "src count >= 3",
          sourceSectionId: "source",
          targetSectionId: "target",
          zIndex: 8,
        }),
        createWorkflowEdge({
          id: "workflow-no-condition",
          sourceActivationLabel: null,
        }),
        createWorkflowEdge({
          hidden: true,
          id: "workflow-hidden",
          sourceActivationLabel: "src count >= 1",
        }),
      ],
      nodes,
    });

    expect(labels).toEqual([
      {
        edgeId: "workflow-threshold",
        height: 20,
        id: "workflow-source-activation:workflow-threshold",
        kind: "workflow-source-activation",
        text: "src count >= 3",
        width: 96,
        x: 380,
        y: 140,
        zIndex: 8,
      },
    ]);
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
          label: "value",
          sourcePortId: "out",
          sourceSectionId: "source",
          targetPortId: "in",
          targetSectionId: "target",
          type: "straight",
        }),
      ],
      handlePositions,
    });

    expect(scene.entries.map((entry) => entry.edgeId)).toEqual([
      "data:edge-hit",
      "connection:active",
    ]);
    expect(scene.labels).toEqual([
      expect.objectContaining({
        edgeId: "edge-hit",
        kind: "data-edge-label",
        text: "value",
        x: 200,
        y: 50,
      }),
    ]);
    expect(scene.reconnectAnchors.map((anchor) => anchor.id)).toEqual([
      "data-edge-reconnect:edge-hit:source",
      "data-edge-reconnect:edge-hit:target",
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

  it("fails loudly when an edge style stroke is not a hex color", () => {
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

    expect(() =>
      buildGpuDataEdgeEntries({
        edges: [
          createDataEdge({
            id: "edge-styled",
            style: { stroke: "red" },
          }),
        ],
        handlePositions,
      }),
    ).toThrow("Setta GPU data edge style.stroke requires a hex color");
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

type AgenticEdgeSourceOptions = Partial<GpuAgenticEdgeSource> & {
  readonly kind?: string | undefined;
};

function createAgenticEdgeSource(
  options: AgenticEdgeSourceOptions = {},
): GpuAgenticEdgeSource {
  const { kind = "chat_section", ...edgeOptions } = options;
  const sourceSectionId = edgeOptions.sourceSectionId ?? "chat-a";
  const targetSectionId = edgeOptions.targetSectionId ?? "context";
  return {
    dedupeKey:
      edgeOptions.dedupeKey ??
      getTestAgenticEdgeKey({ kind, sourceSectionId, targetSectionId }),
    id: "agentic-edge",
    sourceSectionId,
    targetSectionId,
    ...edgeOptions,
  };
}

function createAgenticMissingEdgeSource({
  kind = "chat_section",
  sourceSectionId = "chat-a",
  targetSectionId = "context",
}: {
  readonly kind?: string | undefined;
  readonly sourceSectionId?: string | undefined;
  readonly targetSectionId?: string | undefined;
} = {}): GpuAgenticMissingEdgeSource {
  return {
    dedupeKey: getTestAgenticEdgeKey({
      kind,
      sourceSectionId,
      targetSectionId,
    }),
    sourceSectionId,
    targetSectionId,
  };
}

function getTestAgenticEdgeKey({
  kind,
  sourceSectionId,
  targetSectionId,
}: {
  readonly kind: string;
  readonly sourceSectionId: string;
  readonly targetSectionId: string;
}): string {
  if (kind === "chat_chat") {
    const [first, second] =
      sourceSectionId < targetSectionId
        ? [sourceSectionId, targetSectionId]
        : [targetSectionId, sourceSectionId];
    return `${kind}:${first}:${second}`;
  }
  return `${kind}:${sourceSectionId}:${targetSectionId}`;
}

function createDataEdge(
  options: Partial<GpuDataEdgeSource> = {},
): GpuDataEdgeSource {
  return {
    id: "edge",
    sourcePortId: "out",
    sourceSectionId: "source",
    targetPortId: "in",
    targetSectionId: "target",
    zIndex: 0,
    ...options,
  };
}

function createWorkflowEdge(
  options: Partial<GpuWorkflowEdgeSource> = {},
): GpuWorkflowEdgeSource {
  return {
    hidden: false,
    id: "workflow",
    selected: false,
    sourceActivationLabel: null,
    sourceSectionId: "source",
    style: null,
    targetSectionId: "target",
    zIndex: 0,
    ...options,
  };
}
