import {
  StateMachineUIConfig,
  type AgenticEdge,
  type Edge,
  type SingleConfig,
} from "utils/generatedTypes";

import type { ConnectionStatus } from "../../flowTypes";
import { makeGpuFlowPortKey } from "../../ports/portGeometry";

import { parseGpuHexColor, type GpuRgbaColor } from "../../gpuColors";

import type { GpuPoint } from "../../viewportMath";

import {
  buildGpuEdgeGeometry,
  hitTestGpuEdges,
  type GpuEdgeGeometry,
  type GpuEdgeHitTestInput,
  type GpuEdgeHitTestResult,
} from "../edgeGeometry";

import type {
  GpuEdgeBufferInput,
  GpuEdgeVisualFamily,
} from "../edgeGpuBuffers";

import {
  getAgenticEdgeKey,
  getFallbackFrameHeight,
  getFallbackFrameWidth,
  getGpuSceneEdgeId,
  getNodeFrameHeight,
  getNodeFrameWidth,
  getOppositeGpuEdgeSide,
  getWorkflowPromptSectionId,
  resolveNodeAnchor,
  resolveNodeDimension,
  resolveNodeFrameX,
  resolveNodeFrameY,
  resolveRelativeAnchorSides,
} from "./edgeGeometry";

export type GpuEdgeFamily =
  | "agentic"
  | "agentic-missing"
  | "connection"
  | "data"
  | "workflow"
  | "workflow-prompt-link";

export type GpuEdgeHandlePosition = {
  readonly portId: string;
  readonly sectionId: string;
  readonly side: string;
  readonly type: "source" | "target";
  readonly x: number;
  readonly y: number;
};

export type GpuEdgeNodeFrame = {
  readonly height: number | null | undefined;
  readonly width: number | null | undefined;
  readonly x: number;
  readonly y: number;
};

export type GpuAgenticMissingEdgeSource = Pick<
  AgenticEdge,
  "kind" | "sourceSectionId" | "targetSectionId"
>;

export type GpuConnectionLineSource = {
  readonly pointerFlowPosition: GpuPoint;
  readonly startHandle:
    | {
        readonly handleId: string | null;
        readonly sectionId: string;
        readonly type: "source" | "target";
      }
    | null
    | undefined;
  readonly status?: ConnectionStatus | null | undefined;
};

export type GpuEdgeSceneEntry = GpuEdgeBufferInput &
  GpuEdgeHitTestInput & {
    readonly family: GpuEdgeFamily;
    readonly selectable: boolean;
    readonly sourceEdgeId: string;
  };

export type GpuEdgeSceneLabel = {
  readonly edgeId: string;
  readonly height: number;
  readonly id: string;
  readonly kind: "data-edge-label" | "workflow-source-activation";
  readonly text: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
};

export type GpuEdgeReconnectEndpoint = "source" | "target";

export type GpuEdgeReconnectAnchor = {
  readonly edgeId: string;
  readonly endpoint: GpuEdgeReconnectEndpoint;
  readonly fixedHandleId: string;
  readonly fixedHandleType: "source" | "target";
  readonly fixedIsTarget: boolean;
  readonly fixedSectionId: string;
  readonly id: string;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex?: number | undefined;
};

export type GpuEdgeScene = {
  readonly edges: readonly GpuEdgeBufferInput[];
  readonly entries: readonly GpuEdgeSceneEntry[];
  readonly hitTestEdges: readonly GpuEdgeSceneEntry[];
  readonly labels: readonly GpuEdgeSceneLabel[];
  readonly reconnectAnchors: readonly GpuEdgeReconnectAnchor[];
};

export type GpuEdgeSceneHitTestResult = GpuEdgeHitTestResult & {
  readonly entry: GpuEdgeSceneEntry;
};

export type WorkflowEdge = NonNullable<
  SingleConfig["projectConfig"]["stateMachineEdges"]
>[number];

export type TopLevelSections =
  SingleConfig["projectConfig"]["topLevelSections"];

export type GpuDataEdgeEntriesInput = {
  readonly edges: readonly Edge[];
  readonly handlePositions: Readonly<Record<string, GpuEdgeHandlePosition>>;
  readonly sectionVariantMap: Readonly<Record<string, string>>;
};

export type GpuDataEdgeGeometryInput = Omit<
  GpuDataEdgeEntriesInput,
  "edges"
> & {
  readonly edge: Edge;
};

export type GpuDataEdgeEndpoints = {
  readonly source: GpuEdgeHandlePosition;
  readonly target: GpuEdgeHandlePosition;
};

export type GpuAgenticEdgeEntriesInput = {
  readonly edges: readonly AgenticEdge[];
  readonly nodes: ReadonlyMap<string, GpuEdgeNodeFrame>;
  readonly runningSourceSectionIds?: ReadonlySet<string> | undefined;
  readonly scopeViolationEdges?:
    | readonly GpuAgenticMissingEdgeSource[]
    | undefined;
  readonly topLevelSections: TopLevelSections;
};

export type GpuWorkflowEdgeEntriesInput = {
  readonly edges: readonly WorkflowEdge[];
  readonly nodes: ReadonlyMap<string, GpuEdgeNodeFrame>;
  readonly topLevelSections: TopLevelSections;
};

export type BuildGpuEdgeSceneInput = {
  readonly agenticEdges?: readonly AgenticEdge[] | undefined;
  readonly connectionLine?: GpuConnectionLineSource | null | undefined;
  readonly dataEdges?: readonly Edge[] | undefined;
  readonly handlePositions?:
    | Readonly<Record<string, GpuEdgeHandlePosition>>
    | undefined;
  readonly nodes?: ReadonlyMap<string, GpuEdgeNodeFrame> | undefined;
  readonly runningSourceSectionIds?: ReadonlySet<string> | undefined;
  readonly scopeViolationEdges?:
    | readonly GpuAgenticMissingEdgeSource[]
    | undefined;
  readonly sectionVariantMap?: Readonly<Record<string, string>> | undefined;
  readonly topLevelSections?: TopLevelSections | undefined;
  readonly workflowEdges?: readonly WorkflowEdge[] | undefined;
};

export type NodeAnchorSide = "left" | "right";

export const CONNECTION_LINE_EDGE_ID = "connection:active";

export const DATA_EDGE_LABEL_HEIGHT = 18;

export const DATA_EDGE_LABEL_MIN_WIDTH = 32;

export const DATA_EDGE_LABEL_TEXT_WIDTH = 6.5;

export const DATA_EDGE_LABEL_X_PADDING = 14;

export const DATA_EDGE_RECONNECT_RADIUS = 12;

export const WORKFLOW_SOURCE_ACTIVATION_LABEL_HEIGHT = 20;

export const WORKFLOW_SOURCE_ACTIVATION_LABEL_MIN_WIDTH = 80;

export const WORKFLOW_SOURCE_ACTIVATION_LABEL_TEXT_WIDTH = 6;

export const WORKFLOW_SOURCE_ACTIVATION_LABEL_X_PADDING = 12;

export const sourceActivationCountOperatorLabelByValue = new Map(
  StateMachineUIConfig.sourceActivationCountOperatorOptions.map((option) => [
    option.value,
    option.label,
  ]),
);

export function buildGpuEdgeScene({
  agenticEdges,
  connectionLine,
  dataEdges,
  handlePositions = {},
  nodes = new Map(),
  runningSourceSectionIds,
  scopeViolationEdges,
  sectionVariantMap = {},
  topLevelSections = {},
  workflowEdges,
}: BuildGpuEdgeSceneInput): GpuEdgeScene {
  const dataEdgeInput = {
    edges: dataEdges ?? [],
    handlePositions,
    sectionVariantMap,
  };
  const workflowEdgeInput = {
    edges: workflowEdges ?? [],
    nodes,
    topLevelSections,
  };
  const entries = [
    ...buildGpuDataEdgeEntries(dataEdgeInput),
    ...buildGpuAgenticEdgeEntries({
      edges: agenticEdges ?? [],
      nodes,
      runningSourceSectionIds,
      scopeViolationEdges,
      topLevelSections,
    }),
    ...buildGpuWorkflowEdgeEntries(workflowEdgeInput),
    ...buildGpuConnectionLineEntries({
      connectionLine,
      handlePositions,
    }),
  ];
  return {
    edges: entries,
    entries,
    hitTestEdges: entries.filter((entry) => entry.selectable),
    labels: [
      ...buildGpuDataEdgeLabels(dataEdgeInput),
      ...buildGpuWorkflowEdgeLabels(workflowEdgeInput),
    ],
    reconnectAnchors: buildGpuDataEdgeReconnectAnchors(dataEdgeInput),
  };
}

export function buildGpuDataEdgeEntries({
  edges,
  handlePositions,
  sectionVariantMap,
}: GpuDataEdgeEntriesInput): GpuEdgeSceneEntry[] {
  const entries: GpuEdgeSceneEntry[] = [];
  for (const edge of edges) {
    const geometry = resolveGpuDataEdgeGeometry({
      edge,
      handlePositions,
      sectionVariantMap,
    });
    if (!geometry) {
      continue;
    }
    entries.push(
      createGpuEdgeSceneEntry({
        edgeId: edge.id,
        family: "data",
        geometry,
        color: resolveGpuEdgeStyleStrokeColor(edge.style, "data edge"),
        selectable: true,
        selected: edge.selected,
        zIndex: edge.zIndex,
      }),
    );
  }
  return entries;
}

export function buildGpuDataEdgeLabels({
  edges,
  handlePositions,
  sectionVariantMap,
}: GpuDataEdgeEntriesInput): GpuEdgeSceneLabel[] {
  const labels: GpuEdgeSceneLabel[] = [];
  for (const edge of edges) {
    if (!edge.label) {
      continue;
    }
    const geometry = resolveGpuDataEdgeGeometry({
      edge,
      handlePositions,
      sectionVariantMap,
    });
    if (!geometry) {
      continue;
    }
    labels.push({
      edgeId: edge.id,
      height: DATA_EDGE_LABEL_HEIGHT,
      id: `data-edge-label:${edge.id}`,
      kind: "data-edge-label",
      text: edge.label,
      width: getDataEdgeLabelWidth(edge.label),
      x: geometry.label.x,
      y: geometry.label.y,
      zIndex: edge.zIndex,
    });
  }
  return labels;
}

export function buildGpuDataEdgeReconnectAnchors({
  edges,
  handlePositions,
  sectionVariantMap,
}: GpuDataEdgeEntriesInput): GpuEdgeReconnectAnchor[] {
  const anchors: GpuEdgeReconnectAnchor[] = [];
  for (const edge of edges) {
    const endpoints = resolveGpuDataEdgeEndpoints({
      edge,
      handlePositions,
      sectionVariantMap,
    });
    if (!endpoints) {
      continue;
    }
    anchors.push(
      createGpuDataEdgeReconnectAnchor({
        edge,
        endpoint: "source",
        fixedHandle: endpoints.target,
        position: endpoints.source,
      }),
      createGpuDataEdgeReconnectAnchor({
        edge,
        endpoint: "target",
        fixedHandle: endpoints.source,
        position: endpoints.target,
      }),
    );
  }
  return anchors;
}

export function buildGpuAgenticEdgeEntries({
  edges,
  nodes,
  runningSourceSectionIds,
  scopeViolationEdges,
  topLevelSections,
}: GpuAgenticEdgeEntriesInput): GpuEdgeSceneEntry[] {
  const entries: GpuEdgeSceneEntry[] = [];
  const existingKeys = new Set<string>();
  for (const edge of edges) {
    existingKeys.add(getAgenticEdgeKey(edge));
    if (edge.hidden) {
      continue;
    }
    const geometry = buildNodeAnchorEdgeGeometry({
      edgeId: getGpuSceneEdgeId("agentic", edge.id),
      sourceSectionId: edge.sourceSectionId,
      targetSectionId: edge.targetSectionId,
      nodes,
      topLevelSections,
    });
    if (!geometry) {
      continue;
    }
    entries.push(
      createGpuEdgeSceneEntry({
        active: runningSourceSectionIds?.has(edge.sourceSectionId),
        edgeId: edge.id,
        family: "agentic",
        geometry,
        color: resolveGpuEdgeStyleStrokeColor(edge.style, "agentic edge"),
        selectable: true,
        selected: edge.selected,
        visualFamily: "agentic",
        zIndex: edge.zIndex,
      }),
    );
  }

  for (const missingEdge of scopeViolationEdges ?? []) {
    const key = getAgenticEdgeKey(missingEdge);
    if (existingKeys.has(key)) {
      continue;
    }
    const sourceEdgeId = `missing:${key}`;
    const geometry = buildNodeAnchorEdgeGeometry({
      edgeId: getGpuSceneEdgeId("agentic-missing", sourceEdgeId),
      sourceSectionId: missingEdge.sourceSectionId,
      targetSectionId: missingEdge.targetSectionId,
      nodes,
      topLevelSections,
    });
    if (!geometry) {
      continue;
    }
    entries.push(
      createGpuEdgeSceneEntry({
        edgeId: sourceEdgeId,
        family: "agentic-missing",
        geometry,
        selectable: false,
        visualFamily: "agentic-missing",
      }),
    );
  }
  return entries;
}

export function buildGpuWorkflowEdgeEntries({
  edges,
  nodes,
  topLevelSections,
}: GpuWorkflowEdgeEntriesInput): GpuEdgeSceneEntry[] {
  const entries: GpuEdgeSceneEntry[] = [];
  for (const edge of edges) {
    if (edge.hidden) {
      continue;
    }
    const promptLinkGeometry = buildWorkflowPromptLinkGeometry({
      edge,
      nodes,
      topLevelSections,
    });
    if (promptLinkGeometry) {
      entries.push(
        createGpuEdgeSceneEntry({
          edgeId: edge.id,
          family: "workflow-prompt-link",
          geometry: promptLinkGeometry,
          selectable: false,
          visualFamily: "workflow-prompt-link",
          zIndex: edge.zIndex,
        }),
      );
    }

    const geometry = buildWorkflowMainEdgeGeometry({
      edge,
      nodes,
      topLevelSections,
    });
    if (!geometry) {
      continue;
    }
    entries.push(
      createGpuEdgeSceneEntry({
        edgeId: edge.id,
        family: "workflow",
        geometry,
        color: resolveGpuEdgeStyleStrokeColor(edge.style, "workflow edge"),
        selectable: true,
        selected: edge.selected,
        visualFamily: "workflow",
        zIndex: edge.zIndex,
      }),
    );
  }
  return entries;
}

export function buildGpuWorkflowEdgeLabels({
  edges,
  nodes,
  topLevelSections,
}: GpuWorkflowEdgeEntriesInput): GpuEdgeSceneLabel[] {
  const labels: GpuEdgeSceneLabel[] = [];
  for (const edge of edges) {
    if (edge.hidden) {
      continue;
    }
    const text = getWorkflowSourceActivationCountLabel(edge);
    if (!text) {
      continue;
    }
    const geometry = buildWorkflowMainEdgeGeometry({
      edge,
      nodes,
      topLevelSections,
    });
    if (!geometry) {
      continue;
    }
    labels.push({
      edgeId: edge.id,
      height: WORKFLOW_SOURCE_ACTIVATION_LABEL_HEIGHT,
      id: `workflow-source-activation:${edge.id}`,
      kind: "workflow-source-activation",
      text,
      width: getWorkflowSourceActivationLabelWidth(text),
      x: geometry.label.x,
      y: geometry.label.y,
      zIndex: edge.zIndex,
    });
  }
  return labels;
}

export function buildGpuConnectionLineEntries({
  connectionLine,
  handlePositions,
}: {
  readonly connectionLine?: GpuConnectionLineSource | null | undefined;
  readonly handlePositions: Readonly<Record<string, GpuEdgeHandlePosition>>;
}): GpuEdgeSceneEntry[] {
  if (!connectionLine?.startHandle?.handleId) {
    return [];
  }
  const start =
    handlePositions[
      makeGpuFlowPortKey(
        connectionLine.startHandle.sectionId,
        connectionLine.startHandle.handleId,
        connectionLine.startHandle.type,
      )
    ];
  if (!start) {
    return [];
  }
  const geometry = buildGpuEdgeGeometry({
    edgeId: CONNECTION_LINE_EDGE_ID,
    source: start,
    sourceSide: start.side,
    target: connectionLine.pointerFlowPosition,
    targetSide: getOppositeGpuEdgeSide(start.side),
  });
  return [
    createGpuEdgeSceneEntry({
      active: true,
      connectionStatus: connectionLine.status,
      edgeId: "active",
      family: "connection",
      geometry,
      selectable: false,
    }),
  ];
}

export function hitTestGpuEdgeScene({
  bezierSegments,
  point,
  scene,
  tolerance,
}: {
  readonly bezierSegments?: number | undefined;
  readonly point: GpuPoint;
  readonly scene: Pick<GpuEdgeScene, "hitTestEdges">;
  readonly tolerance: number;
}): GpuEdgeSceneHitTestResult | null {
  const result = hitTestGpuEdges({
    bezierSegments,
    edges: scene.hitTestEdges,
    point,
    tolerance,
  });
  if (!result) {
    return null;
  }
  const entry = scene.hitTestEdges.find(
    (candidate) => candidate.edgeId === result.edgeId,
  );
  if (!entry) {
    return null;
  }
  return { ...result, entry };
}

export function createGpuEdgeSceneEntry({
  active,
  color,
  connectionStatus,
  edgeId,
  family,
  geometry,
  selectable,
  selected,
  visualFamily,
  zIndex,
}: {
  readonly active?: boolean | undefined;
  readonly color?: GpuRgbaColor | undefined;
  readonly connectionStatus?: ConnectionStatus | null | undefined;
  readonly edgeId: string;
  readonly family: GpuEdgeFamily;
  readonly geometry: GpuEdgeGeometry;
  readonly selectable: boolean;
  readonly selected?: boolean | undefined;
  readonly visualFamily?: GpuEdgeVisualFamily | undefined;
  readonly zIndex?: number | undefined;
}): GpuEdgeSceneEntry {
  return {
    active,
    color,
    connectionStatus,
    edgeId: geometry.edgeId,
    family,
    geometry,
    selectable,
    selected,
    sourceEdgeId: edgeId,
    visualFamily,
    zIndex,
  };
}

export function resolveGpuEdgeStyleStrokeColor(
  style: unknown,
  subject: string,
): GpuRgbaColor | undefined {
  if (style === null || style === undefined) {
    return undefined;
  }
  if (typeof style !== "object" || Array.isArray(style)) {
    throw new Error(`Setta GPU ${subject} style must be an object.`);
  }
  const stroke = (style as { readonly stroke?: unknown }).stroke;
  if (stroke === null || stroke === undefined || stroke === "") {
    return undefined;
  }
  if (typeof stroke !== "string") {
    throw new Error(
      `Setta GPU ${subject} style.stroke must be a hex color string.`,
    );
  }
  return parseGpuHexColor(stroke, `${subject} style.stroke`);
}

export function resolveGpuDataEdgeGeometry({
  edge,
  handlePositions,
  sectionVariantMap,
}: GpuDataEdgeGeometryInput): GpuEdgeGeometry | null {
  const endpoints = resolveGpuDataEdgeEndpoints({
    edge,
    handlePositions,
    sectionVariantMap,
  });
  if (!endpoints) {
    return null;
  }
  const { source, target } = endpoints;
  return buildGpuEdgeGeometry({
    edgeId: getGpuSceneEdgeId("data", edge.id),
    source,
    sourceSide: source.side,
    target,
    targetSide: target.side,
    type: edge.type,
  });
}

export function resolveGpuDataEdgeEndpoints({
  edge,
  handlePositions,
  sectionVariantMap,
}: GpuDataEdgeGeometryInput): GpuDataEdgeEndpoints | null {
  if (
    edge.hidden ||
    sectionVariantMap[edge.sourceSectionId] !== edge.sourceVariantId ||
    sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
  ) {
    return null;
  }
  const source =
    handlePositions[
      makeGpuFlowPortKey(edge.sourceSectionId, edge.sourcePortId, "source")
    ];
  const target =
    handlePositions[
      makeGpuFlowPortKey(edge.targetSectionId, edge.targetPortId, "target")
    ];
  if (!source || !target) {
    return null;
  }
  return { source, target };
}

export function getDataEdgeLabelWidth(text: string): number {
  return Math.max(
    DATA_EDGE_LABEL_MIN_WIDTH,
    text.length * DATA_EDGE_LABEL_TEXT_WIDTH + DATA_EDGE_LABEL_X_PADDING,
  );
}

export function createGpuDataEdgeReconnectAnchor({
  edge,
  endpoint,
  fixedHandle,
  position,
}: {
  readonly edge: Edge;
  readonly endpoint: GpuEdgeReconnectEndpoint;
  readonly fixedHandle: GpuEdgeHandlePosition;
  readonly position: GpuEdgeHandlePosition;
}): GpuEdgeReconnectAnchor {
  const center = shiftGpuEdgeReconnectAnchorCenter({
    radius: DATA_EDGE_RECONNECT_RADIUS,
    side: position.side,
    x: position.x,
    y: position.y,
  });
  return {
    edgeId: edge.id,
    endpoint,
    fixedHandleId: fixedHandle.portId,
    fixedHandleType: fixedHandle.type,
    fixedIsTarget: fixedHandle.type === "target",
    fixedSectionId: fixedHandle.sectionId,
    id: `data-edge-reconnect:${edge.id}:${endpoint}`,
    radius: DATA_EDGE_RECONNECT_RADIUS,
    x: center.x,
    y: center.y,
    zIndex: edge.zIndex,
  };
}

export function shiftGpuEdgeReconnectAnchorCenter({
  radius,
  side,
  x,
  y,
}: {
  readonly radius: number;
  readonly side: string;
  readonly x: number;
  readonly y: number;
}): GpuPoint {
  switch (side) {
    case "left":
      return { x: x - radius, y };
    case "right":
      return { x: x + radius, y };
    case "top":
      return { x, y: y - radius };
    case "bottom":
      return { x, y: y + radius };
    default:
      throw new Error(`Unsupported GPU reconnect anchor side "${side}".`);
  }
}

export function buildNodeAnchorEdgeGeometry({
  edgeId,
  nodes,
  sourceSectionId,
  targetSectionId,
  topLevelSections,
}: {
  readonly edgeId: string;
  readonly nodes: ReadonlyMap<string, GpuEdgeNodeFrame>;
  readonly sourceSectionId: string;
  readonly targetSectionId: string;
  readonly topLevelSections: TopLevelSections;
}): GpuEdgeGeometry | null {
  const sourceFrame = resolveNodeFrame(
    sourceSectionId,
    nodes,
    topLevelSections,
  );
  const targetFrame = resolveNodeFrame(
    targetSectionId,
    nodes,
    topLevelSections,
  );
  const source = resolveNodeAnchor(sourceFrame, "right");
  const target = resolveNodeAnchor(targetFrame, "left");
  if (!source || !target) {
    return null;
  }
  return buildGpuEdgeGeometry({
    edgeId,
    source,
    sourceSide: "right",
    target,
    targetSide: "left",
  });
}

export function buildWorkflowPromptLinkGeometry({
  edge,
  nodes,
  topLevelSections,
}: {
  readonly edge: WorkflowEdge;
  readonly nodes: ReadonlyMap<string, GpuEdgeNodeFrame>;
  readonly topLevelSections: TopLevelSections;
}): GpuEdgeGeometry | null {
  const promptSectionId = getWorkflowPromptSectionId(edge);
  if (!promptSectionId) {
    return null;
  }
  const promptFrame = resolveNodeFrame(
    promptSectionId,
    nodes,
    topLevelSections,
  );
  const targetFrame = resolveNodeFrame(
    edge.targetSectionId,
    nodes,
    topLevelSections,
  );
  const { sourceSide, targetSide } = resolveRelativeAnchorSides(
    promptFrame,
    targetFrame,
  );
  const source = resolveNodeAnchor(promptFrame, sourceSide);
  const target = resolveNodeAnchor(targetFrame, targetSide);
  if (!source || !target) {
    return null;
  }
  return buildGpuEdgeGeometry({
    edgeId: getGpuSceneEdgeId("workflow-prompt-link", edge.id),
    source,
    sourceSide,
    target,
    targetSide,
  });
}

export function buildWorkflowMainEdgeGeometry({
  edge,
  nodes,
  topLevelSections,
}: {
  readonly edge: WorkflowEdge;
  readonly nodes: ReadonlyMap<string, GpuEdgeNodeFrame>;
  readonly topLevelSections: TopLevelSections;
}): GpuEdgeGeometry | null {
  return buildNodeAnchorEdgeGeometry({
    edgeId: getGpuSceneEdgeId("workflow", edge.id),
    sourceSectionId: edge.sourceSectionId,
    targetSectionId: edge.targetSectionId,
    nodes,
    topLevelSections,
  });
}

export function getWorkflowSourceActivationCountLabel(
  edge: WorkflowEdge,
): string | null {
  const condition = edge.sourceActivationCountCondition;
  if (!condition) {
    return null;
  }
  const operatorLabel =
    sourceActivationCountOperatorLabelByValue.get(condition.operator) ??
    condition.operator;
  return `src count ${operatorLabel} ${condition.value}`;
}

export function getWorkflowSourceActivationLabelWidth(text: string): number {
  return Math.max(
    WORKFLOW_SOURCE_ACTIVATION_LABEL_MIN_WIDTH,
    text.length * WORKFLOW_SOURCE_ACTIVATION_LABEL_TEXT_WIDTH +
      WORKFLOW_SOURCE_ACTIVATION_LABEL_X_PADDING,
  );
}

export function resolveNodeFrame(
  sectionId: string,
  nodes: ReadonlyMap<string, GpuEdgeNodeFrame>,
  topLevelSections: TopLevelSections,
): GpuEdgeNodeFrame | null {
  const node = nodes.get(sectionId);
  const fallback = topLevelSections[sectionId];
  const width = resolveNodeDimension(
    getNodeFrameWidth(node),
    getFallbackFrameWidth(fallback),
  );
  const height = resolveNodeDimension(
    getNodeFrameHeight(node),
    getFallbackFrameHeight(fallback),
  );
  if (width === null || height === null) {
    return null;
  }
  return {
    height,
    width,
    x: resolveNodeFrameX(node, fallback),
    y: resolveNodeFrameY(node, fallback),
  };
}
