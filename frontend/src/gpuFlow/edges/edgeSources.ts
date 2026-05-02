import { makeEdgeHandleKey } from "state/edgeHandleKeys";
import {
  AgenticEdgeKindEnum,
  type AgenticEdge,
  type Edge,
  type SingleConfig,
  type TopLevelSectionLayout,
} from "utils/generatedTypes";
import type { ConnectionStatus } from "../flowTypes";
import { parseGpuHexColor, type GpuRgbaColor } from "../gpuColors";
import type { GpuPoint } from "../viewportMath";
import {
  buildGpuEdgeGeometry,
  hitTestGpuEdges,
  type GpuEdgeGeometry,
  type GpuEdgeHitTestInput,
  type GpuEdgeHitTestResult,
  type GpuEdgeSide,
} from "./edgeGeometry";
import type { GpuEdgeBufferInput } from "./edgeGpuBuffers";

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

export type GpuEdgeScene = {
  readonly edges: readonly GpuEdgeBufferInput[];
  readonly entries: readonly GpuEdgeSceneEntry[];
  readonly hitTestEdges: readonly GpuEdgeSceneEntry[];
};

export type GpuEdgeSceneHitTestResult = GpuEdgeHitTestResult & {
  readonly entry: GpuEdgeSceneEntry;
};

type WorkflowEdge = SingleConfig["projectConfig"]["stateMachineEdges"][number];
type TopLevelSections = SingleConfig["projectConfig"]["topLevelSections"];

type GpuDataEdgeEntriesInput = {
  readonly edges: readonly Edge[];
  readonly handlePositions: Readonly<Record<string, GpuEdgeHandlePosition>>;
  readonly sectionVariantMap: Readonly<Record<string, string>>;
};

type GpuAgenticEdgeEntriesInput = {
  readonly edges: readonly AgenticEdge[];
  readonly nodes: ReadonlyMap<string, GpuEdgeNodeFrame>;
  readonly runningSourceSectionIds?: ReadonlySet<string> | undefined;
  readonly scopeViolationEdges?:
    | readonly GpuAgenticMissingEdgeSource[]
    | undefined;
  readonly topLevelSections: TopLevelSections;
};

type GpuWorkflowEdgeEntriesInput = {
  readonly edges: readonly WorkflowEdge[];
  readonly nodes: ReadonlyMap<string, GpuEdgeNodeFrame>;
  readonly topLevelSections: TopLevelSections;
};

type BuildGpuEdgeSceneInput = {
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

type NodeAnchorSide = "left" | "right";

const CONNECTION_LINE_EDGE_ID = "connection:active";

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
  const entries = [
    ...buildGpuDataEdgeEntries({
      edges: dataEdges ?? [],
      handlePositions,
      sectionVariantMap,
    }),
    ...buildGpuAgenticEdgeEntries({
      edges: agenticEdges ?? [],
      nodes,
      runningSourceSectionIds,
      scopeViolationEdges,
      topLevelSections,
    }),
    ...buildGpuWorkflowEdgeEntries({
      edges: workflowEdges ?? [],
      nodes,
      topLevelSections,
    }),
    ...buildGpuConnectionLineEntries({
      connectionLine,
      handlePositions,
    }),
  ];
  return {
    edges: entries,
    entries,
    hitTestEdges: entries.filter((entry) => entry.selectable),
  };
}

export function buildGpuDataEdgeEntries({
  edges,
  handlePositions,
  sectionVariantMap,
}: GpuDataEdgeEntriesInput): GpuEdgeSceneEntry[] {
  const entries: GpuEdgeSceneEntry[] = [];
  for (const edge of edges) {
    if (
      edge.hidden ||
      sectionVariantMap[edge.sourceSectionId] !== edge.sourceVariantId ||
      sectionVariantMap[edge.targetSectionId] !== edge.targetVariantId
    ) {
      continue;
    }
    const source =
      handlePositions[
        makeEdgeHandleKey(edge.sourceSectionId, edge.sourcePortId, "source")
      ];
    const target =
      handlePositions[
        makeEdgeHandleKey(edge.targetSectionId, edge.targetPortId, "target")
      ];
    if (!source || !target) {
      continue;
    }
    entries.push(
      createGpuEdgeSceneEntry({
        edgeId: edge.id,
        family: "data",
        geometry: buildGpuEdgeGeometry({
          edgeId: getGpuSceneEdgeId("data", edge.id),
          source,
          sourceSide: source.side,
          target,
          targetSide: target.side,
          type: edge.type,
        }),
        color: resolveGpuEdgeStyleStrokeColor(edge.style, "data edge"),
        selectable: true,
        selected: edge.selected,
        zIndex: edge.zIndex,
      }),
    );
  }
  return entries;
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
        active: true,
        edgeId: sourceEdgeId,
        family: "agentic-missing",
        geometry,
        selectable: false,
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
          zIndex: edge.zIndex,
        }),
      );
    }

    const geometry = buildNodeAnchorEdgeGeometry({
      edgeId: getGpuSceneEdgeId("workflow", edge.id),
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
        edgeId: edge.id,
        family: "workflow",
        geometry,
        color: resolveGpuEdgeStyleStrokeColor(edge.style, "workflow edge"),
        selectable: true,
        selected: edge.selected,
        zIndex: edge.zIndex,
      }),
    );
  }
  return entries;
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
      makeEdgeHandleKey(
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

function createGpuEdgeSceneEntry({
  active,
  color,
  connectionStatus,
  edgeId,
  family,
  geometry,
  selectable,
  selected,
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
    zIndex,
  };
}

function resolveGpuEdgeStyleStrokeColor(
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

function buildNodeAnchorEdgeGeometry({
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

function buildWorkflowPromptLinkGeometry({
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

function resolveNodeFrame(
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

function getNodeFrameWidth(
  node: GpuEdgeNodeFrame | undefined,
): number | null | undefined {
  return node ? node.width : null;
}

function getNodeFrameHeight(
  node: GpuEdgeNodeFrame | undefined,
): number | null | undefined {
  return node ? node.height : null;
}

function getFallbackFrameWidth(
  fallback: TopLevelSectionLayout | undefined,
): number | null | undefined {
  return fallback ? fallback.w : null;
}

function getFallbackFrameHeight(
  fallback: TopLevelSectionLayout | undefined,
): number | null | undefined {
  return fallback ? fallback.h : null;
}

function resolveNodeFrameX(
  node: GpuEdgeNodeFrame | undefined,
  fallback: TopLevelSectionLayout | undefined,
): number {
  if (node) {
    return node.x;
  }
  return fallback ? fallback.x : 0;
}

function resolveNodeFrameY(
  node: GpuEdgeNodeFrame | undefined,
  fallback: TopLevelSectionLayout | undefined,
): number {
  if (node) {
    return node.y;
  }
  return fallback ? fallback.y : 0;
}

function resolveNodeDimension(
  primaryValue: number | null | undefined,
  fallbackValue: TopLevelSectionLayout["w"],
): number | null {
  if (primaryValue !== null && primaryValue !== undefined && primaryValue > 0) {
    return primaryValue;
  }
  if (
    fallbackValue !== null &&
    fallbackValue !== undefined &&
    fallbackValue > 0
  ) {
    return fallbackValue;
  }
  return null;
}

function resolveNodeAnchor(
  frame: GpuEdgeNodeFrame | null,
  side: NodeAnchorSide,
): GpuPoint | null {
  if (!frame || !frame.width || !frame.height) {
    return null;
  }
  return {
    x: side === "left" ? frame.x : frame.x + frame.width,
    y: frame.y + frame.height / 2,
  };
}

function resolveRelativeAnchorSides(
  sourceFrame: GpuEdgeNodeFrame | null,
  targetFrame: GpuEdgeNodeFrame | null,
): {
  readonly sourceSide: NodeAnchorSide;
  readonly targetSide: NodeAnchorSide;
} {
  const sourceCenterX = getNodeCenterX(sourceFrame);
  const targetCenterX = getNodeCenterX(targetFrame);
  if (sourceCenterX === null || targetCenterX === null) {
    return { sourceSide: "right", targetSide: "left" };
  }
  if (sourceCenterX <= targetCenterX) {
    return { sourceSide: "right", targetSide: "left" };
  }
  return { sourceSide: "left", targetSide: "right" };
}

function getNodeCenterX(frame: GpuEdgeNodeFrame | null): number | null {
  if (!frame || !frame.width) {
    return null;
  }
  return frame.x + frame.width / 2;
}

function getWorkflowPromptSectionId(edge: WorkflowEdge): string | null {
  if (edge.targetAction?.type !== "send_prompt") {
    return null;
  }
  return edge.targetAction.promptSectionId ?? null;
}

function getAgenticEdgeKey(
  edge: Pick<AgenticEdge, "kind" | "sourceSectionId" | "targetSectionId">,
): string {
  if (edge.kind === AgenticEdgeKindEnum.chat_chat) {
    const [first, second] =
      edge.sourceSectionId < edge.targetSectionId
        ? [edge.sourceSectionId, edge.targetSectionId]
        : [edge.targetSectionId, edge.sourceSectionId];
    return `${edge.kind}:${first}:${second}`;
  }
  return `${edge.kind}:${edge.sourceSectionId}:${edge.targetSectionId}`;
}

function getGpuSceneEdgeId(family: GpuEdgeFamily, edgeId: string): string {
  return `${family}:${edgeId}`;
}

function getOppositeGpuEdgeSide(side: string): GpuEdgeSide {
  switch (side) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    default:
      throw new Error(`Unsupported GPU connection line side "${side}".`);
  }
}
