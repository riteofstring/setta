import {
  recordingWorkflowGraphEventName,
  recordingWorkflowGraphManualSnapshotEventName,
  workflowGraphRecordingSchemaVersion,
  type RendererGraphInteractionEvent,
  type RendererGraphLayoutSaveEvent,
  type RendererGraphLayoutSaveOwner,
  type RendererGraphLayoutSaveSummary,
  type RendererGraphLayoutSaveTarget,
  type RendererGraphNodeSummary,
  type RendererGraphRecordedEvent,
  type RendererGraphRecordingState,
  type RendererGraphReplacementEvent,
  type RendererGraphSnapshotEvent,
  type RendererGraphTimingSummary,
  type RendererGraphTrajectorySummary,
  type RendererGraphTruncation,
  type RendererGraphWorkflowSummary,
} from "@shared/recording";

type UnknownRecord = Record<string, unknown>;

interface WorkflowGraphDebugApi {
  getSnapshot: (surfaceId?: string, options?: { includeVisual?: boolean }) => unknown;
  getSurfaceIds: () => string[];
}

interface LayoutRecordingState {
  generation: number | null;
  lastLayoutSave: RendererGraphLayoutSaveSummary | null;
  writeCount: number;
}

interface GraphRecordingStateOptions {
  movedNodeIds?: readonly string[];
  surfaceId: string;
  touchedNodeIds?: readonly string[];
}

interface GraphInteractionRecordingOptions {
  affectedNodeIds?: readonly string[];
  kind: RendererGraphInteractionEvent["interaction"]["kind"];
  movementOwner?: string;
  phase: RendererGraphInteractionEvent["interaction"]["phase"];
  pointerType?: string;
  reason?: string;
  snapshot?: unknown;
  sourceNodeId?: string;
  sourcePortId?: string;
  surfaceId: string;
  targetNodeId?: string;
  targetPortId?: string;
}

interface GraphLayoutSaveRecordingOptions {
  affectedNodeIds: readonly string[];
  error?: string;
  generation: number;
  owners: readonly RendererGraphLayoutSaveOwner[];
  phase: RendererGraphLayoutSaveEvent["layoutSave"]["phase"];
  status: RendererGraphLayoutSaveEvent["layoutSave"]["status"];
  surfaceId: string;
  target?: RendererGraphLayoutSaveTarget | null;
}

interface GraphReplacementRecordingOptions {
  activeInteraction?: string;
  graphVersion: number;
  phase: RendererGraphReplacementEvent["replacement"]["phase"];
  reason: string;
  snapshot?: unknown;
  surfaceId: string;
}

const maxRecordedIds = 48;
const maxRecordedNodes = 24;
const maxRecordedTimingSamples = 12;
const maxRecordedTrajectoryAnchors = 24;

const layoutRecordingStateBySurfaceId = new Map<string, LayoutRecordingState>();
let manualSnapshotListenerInstalled = false;

export function ensureWorkflowGraphRecordingManualSnapshotListener(): void {
  if (manualSnapshotListenerInstalled || typeof window === "undefined") {
    return;
  }
  manualSnapshotListenerInstalled = true;
  window.addEventListener(recordingWorkflowGraphManualSnapshotEventName, (event) => {
    const detail = customEventDetailRecord(event);
    const requestedSurfaceId = stringField(detail, "surfaceId");
    const surfaceIds = requestedSurfaceId
      ? [requestedSurfaceId]
      : (workflowGraphDebugApi()?.getSurfaceIds() ?? []);
    for (const surfaceId of surfaceIds) {
      recordWorkflowGraphSnapshotEvent({
        surfaceId,
        trigger: "manual",
      });
    }
  });
}

export function recordWorkflowGraphSnapshotEvent({
  movedNodeIds = [],
  snapshot,
  surfaceId,
  touchedNodeIds = [],
  trigger,
}: {
  movedNodeIds?: readonly string[];
  snapshot?: unknown;
  surfaceId: string;
  touchedNodeIds?: readonly string[];
  trigger: RendererGraphSnapshotEvent["trigger"];
}): void {
  dispatchGraphRecordingEvent({
    ...graphEventBase({
      movedNodeIds,
      snapshot,
      surfaceId,
      touchedNodeIds,
    }),
    trigger,
    type: "graph_snapshot",
  });
}

export function recordWorkflowGraphInteractionEvent(
  options: GraphInteractionRecordingOptions,
): void {
  const affectedNodeIds = options.affectedNodeIds ?? [];
  dispatchGraphRecordingEvent({
    ...graphEventBase({
      movedNodeIds: movedNodeIdsForInteraction(options.kind, affectedNodeIds),
      snapshot: options.snapshot,
      surfaceId: options.surfaceId,
      touchedNodeIds: affectedNodeIds,
    }),
    interaction: graphInteractionPayload(options, affectedNodeIds),
    type: "graph_interaction",
  });
}

export function recordWorkflowGraphLayoutSaveEvent({
  affectedNodeIds,
  error = "",
  generation,
  owners,
  phase,
  status,
  surfaceId,
  target = null,
}: GraphLayoutSaveRecordingOptions): void {
  const layoutSave = {
    affectedNodeIds: boundedStrings(affectedNodeIds),
    error,
    generation,
    owner: summarizedLayoutSaveOwner(owners),
    owners: uniqueLayoutSaveOwners(owners),
    phase,
    status,
    target,
  } satisfies RendererGraphLayoutSaveEvent["layoutSave"];
  updateLayoutRecordingState(surfaceId, layoutSave);
  dispatchGraphRecordingEvent({
    ...graphEventBase({
      movedNodeIds: affectedNodeIds,
      surfaceId,
      touchedNodeIds: affectedNodeIds,
    }),
    layoutSave,
    type: "graph_layout_save",
  });
  recordWorkflowGraphSnapshotEvent({
    movedNodeIds: affectedNodeIds,
    surfaceId,
    touchedNodeIds: affectedNodeIds,
    trigger: phase === "started" ? "layout_save_started" : "layout_save_settled",
  });
}

export function recordWorkflowGraphReplacementEvent({
  activeInteraction = "",
  graphVersion,
  phase,
  reason,
  snapshot,
  surfaceId,
}: GraphReplacementRecordingOptions): void {
  dispatchGraphRecordingEvent({
    ...graphEventBase({ snapshot, surfaceId }),
    replacement: {
      activeInteraction,
      graphVersion,
      phase,
      reason,
    },
    type: "graph_replacement",
  });
}

function graphEventBase({
  movedNodeIds = [],
  snapshot,
  surfaceId,
  touchedNodeIds = [],
}: GraphRecordingStateOptions & { snapshot?: unknown }): Omit<
  RendererGraphRecordedEvent,
  "interaction" | "layoutSave" | "replacement" | "trigger" | "type"
> {
  return {
    at: timestamp(),
    graph: compactWorkflowGraphRecordingState(snapshot ?? captureWorkflowGraphSnapshot(surfaceId), {
      movedNodeIds,
      surfaceId,
      touchedNodeIds,
    }),
    surfaceId,
    url: typeof window === "undefined" ? "" : window.location.href,
  };
}

function movedNodeIdsForInteraction(
  kind: GraphInteractionRecordingOptions["kind"],
  affectedNodeIds: readonly string[],
): readonly string[] {
  return kind === "node_drag" ? affectedNodeIds : [];
}

function graphInteractionPayload(
  options: GraphInteractionRecordingOptions,
  affectedNodeIds: readonly string[],
): RendererGraphInteractionEvent["interaction"] {
  return {
    affectedNodeIds: boundedStrings(affectedNodeIds),
    kind: options.kind,
    movementOwner: options.movementOwner ?? "",
    phase: options.phase,
    pointerType: options.pointerType ?? "",
    reason: options.reason ?? "",
    sourceNodeId: options.sourceNodeId ?? "",
    sourcePortId: options.sourcePortId ?? "",
    targetNodeId: options.targetNodeId ?? "",
    targetPortId: options.targetPortId ?? "",
  };
}

function dispatchGraphRecordingEvent(event: RendererGraphRecordedEvent): void {
  if (!graphRecordingEnabled() || typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(recordingWorkflowGraphEventName, {
      detail: event,
    }),
  );
}

function graphRecordingEnabled(): boolean {
  const env = typeof process === "undefined" ? undefined : process.env;
  return (
    env?.SETTA_RECORDING === "1" ||
    env?.SETTA_RECORDING_DIR !== undefined ||
    (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-setta-recording") === "true")
  );
}

function compactWorkflowGraphRecordingState(
  snapshot: unknown,
  { movedNodeIds = [], surfaceId, touchedNodeIds = [] }: GraphRecordingStateOptions,
): RendererGraphRecordingState {
  const root = recordOrNull(snapshot);
  const graph = recordField(root, "graph");
  const render = recordField(root, "render");
  const interaction = recordField(root, "interaction");
  const nodes = arrayField(graph, "nodes")
    .map(recordOrNull)
    .filter((node): node is UnknownRecord => node !== null);
  const selectedNodeIds = uniqueStrings(arrayField(interaction, "selectedNodeIds"));
  const selectedEdgeIds = uniqueStrings(arrayField(interaction, "selectedEdgeIds"));
  const movedNodeIdSet = new Set(boundedStrings(movedNodeIds));
  const touchedNodeIdSet = new Set(boundedStrings(touchedNodeIds));
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const truncation: RendererGraphTruncation[] = [];
  const summaries = nodes.map((node) =>
    graphNodeSummary(node, {
      movedNodeIds: movedNodeIdSet,
      selectedNodeIds: selectedNodeIdSet,
    }),
  );
  const visibleNodes = summaries.filter((node) => node.visible);
  const selectedNodes = summaries.filter((node) => node.selected);
  const touchedNodes = summaries.filter((node) => touchedNodeIdSet.has(node.id));
  const movedNodes = summaries.filter((node) => node.moved);
  const layout = layoutRecordingStateBySurfaceId.get(surfaceId) ?? emptyLayoutRecordingState();

  return {
    camera: graphCamera(recordField(root, "camera")),
    counts: {
      edges: integerField(graph, "edgeCount", arrayField(graph, "edges").length),
      materializedNodes: summaries.filter((node) => node.materialized).length,
      movedNodes: movedNodes.length,
      nodes: integerField(graph, "nodeCount", summaries.length),
      selectedEdges: selectedEdgeIds.length,
      selectedNodes: selectedNodeIds.length,
      trajectorySprites: integerField(render, "trajectorySpriteDisplayCount", 0),
      visibleNodes: visibleNodes.length,
    },
    lastLayoutSave: layout.lastLayoutSave,
    nodes: {
      moved: limitedItems(movedNodes, "graph.nodes.moved", maxRecordedNodes, truncation),
      selected: limitedItems(selectedNodes, "graph.nodes.selected", maxRecordedNodes, truncation),
      touched: limitedItems(touchedNodes, "graph.nodes.touched", maxRecordedNodes, truncation),
      visible: limitedItems(visibleNodes, "graph.nodes.visible", maxRecordedNodes, truncation),
    },
    pendingLayout: {
      generation: layout.generation,
      writeCount: layout.writeCount,
    },
    schemaVersion: workflowGraphRecordingSchemaVersion,
    selected: {
      edgeIds: limitedItems(selectedEdgeIds, "graph.selected.edgeIds", maxRecordedIds, truncation),
      nodeIds: limitedItems(selectedNodeIds, "graph.selected.nodeIds", maxRecordedIds, truncation),
    },
    surfaceId,
    timing: graphTimingSummary(render, truncation),
    trajectory: graphTrajectorySummary(render, truncation),
    truncation,
    workflow: graphWorkflowSummary(recordField(graph, "workflow")),
  };
}

function graphNodeSummary(
  node: UnknownRecord,
  {
    movedNodeIds,
    selectedNodeIds,
  }: {
    movedNodeIds: ReadonlySet<string>;
    selectedNodeIds: ReadonlySet<string>;
  },
): RendererGraphNodeSummary {
  const id = stringField(node, "id");
  return {
    id,
    kind: stringField(node, "kind"),
    layer: stringField(node, "layer"),
    materialized: booleanField(node, "materialized", false),
    moved: movedNodeIds.has(id),
    movementOwner: movementOwnerKind(recordField(node, "movementOwner")),
    screenX: roundedNumber(numberField(node, "screenX", 0)),
    screenY: roundedNumber(numberField(node, "screenY", 0)),
    selected: selectedNodeIds.has(id),
    status: stringField(node, "status"),
    visible: booleanField(node, "materialized", false),
    x: roundedNumber(numberField(node, "x", 0)),
    y: roundedNumber(numberField(node, "y", 0)),
  };
}

function graphCamera(camera: UnknownRecord | null): RendererGraphRecordingState["camera"] {
  if (camera === null) {
    return null;
  }
  return {
    x: roundedNumber(numberField(camera, "x", 0)),
    y: roundedNumber(numberField(camera, "y", 0)),
    zoom: roundedNumber(numberField(camera, "zoom", 1)),
  };
}

function graphTimingSummary(
  render: UnknownRecord | null,
  truncation: RendererGraphTruncation[],
): RendererGraphTimingSummary | null {
  if (render === null) {
    return null;
  }
  const timingBuckets = recordField(render, "timingBuckets") ?? {};
  const timingSamples = arrayField(render, "timingSamples");
  const recentFrameMs = arrayField(render, "recentFrameMs")
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map(roundedNumber);
  return {
    averageFrameMs: nullableRoundedNumber(render, "averageFrameMs"),
    p95FrameMs: nullableRoundedNumber(render, "p95FrameMs"),
    recentFrameMs: limitedItems(
      recentFrameMs.slice(-maxRecordedTimingSamples),
      "graph.timing.recentFrameMs",
      maxRecordedTimingSamples,
      truncation,
      recentFrameMs.length,
    ),
    timingBucketCount: Object.keys(timingBuckets).length,
    timingBuckets,
    timingSampleCount: timingSamples.length,
    timingSamples: limitedItems(
      timingSamples.slice(-maxRecordedTimingSamples),
      "graph.timing.timingSamples",
      maxRecordedTimingSamples,
      truncation,
      timingSamples.length,
    ),
    worstFrameMs: nullableRoundedNumber(render, "worstFrameMs"),
  };
}

function graphTrajectorySummary(
  render: UnknownRecord | null,
  truncation: RendererGraphTruncation[],
): RendererGraphTrajectorySummary {
  const anchors = recordField(render, "trajectoryAnchors");
  const anchorSummaries = arrayField(anchors, "anchors");
  return {
    anchorSummaries: limitedItems(
      anchorSummaries,
      "graph.trajectory.anchorSummaries",
      maxRecordedTrajectoryAnchors,
      truncation,
    ),
    anchors: recordField(anchors, "counts") ?? null,
    displayCount: integerField(render, "trajectorySpriteDisplayCount", 0),
    frameRevision: integerField(render, "trajectorySpriteFrameRevision", 0),
    groupCount: integerField(render, "trajectorySpriteGroupCount", 0),
    recentLaneCount: integerField(render, "trajectorySpriteRecentLaneCount", 0),
    totalCount: integerField(render, "trajectorySpriteTotalCount", 0),
  };
}

function graphWorkflowSummary(workflow: UnknownRecord | null): RendererGraphWorkflowSummary | null {
  if (workflow === null) {
    return null;
  }
  return {
    definitionId: stringField(workflow, "definitionId"),
    editable:
      typeof workflow.editable === "boolean" ? workflow.editable : booleanOrNull(workflow.editable),
    executionId: stringField(workflow, "executionId"),
    versionId: stringField(workflow, "definitionVersionId"),
    viewMode: stringField(workflow, "viewMode"),
    workspaceId: stringField(workflow, "workspaceId"),
  };
}

function updateLayoutRecordingState(
  surfaceId: string,
  layoutSave: RendererGraphLayoutSaveEvent["layoutSave"],
): void {
  const current = layoutRecordingStateBySurfaceId.get(surfaceId) ?? emptyLayoutRecordingState();
  const writeCount =
    layoutSave.phase === "started" ? current.writeCount + 1 : Math.max(0, current.writeCount - 1);
  layoutRecordingStateBySurfaceId.set(surfaceId, {
    generation: layoutSave.generation,
    lastLayoutSave: {
      affectedNodeIds: layoutSave.affectedNodeIds,
      error: layoutSave.error,
      generation: layoutSave.generation,
      owner: layoutSave.owner,
      owners: layoutSave.owners,
      status: layoutSave.status,
    },
    writeCount,
  });
}

function emptyLayoutRecordingState(): LayoutRecordingState {
  return {
    generation: null,
    lastLayoutSave: null,
    writeCount: 0,
  };
}

function captureWorkflowGraphSnapshot(surfaceId: string): unknown {
  try {
    return workflowGraphDebugApi()?.getSnapshot(surfaceId, { includeVisual: false }) ?? null;
  } catch {
    return null;
  }
}

function workflowGraphDebugApi(): WorkflowGraphDebugApi | null {
  if (typeof window === "undefined") {
    return null;
  }
  const candidate = (window as unknown as { __settaWorkflowGraphDebug?: unknown })
    .__settaWorkflowGraphDebug;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Partial<WorkflowGraphDebugApi>;
  if (typeof record.getSnapshot !== "function" || typeof record.getSurfaceIds !== "function") {
    return null;
  }
  return {
    getSnapshot: record.getSnapshot.bind(record),
    getSurfaceIds: record.getSurfaceIds.bind(record),
  };
}

function customEventDetailRecord(event: Event): UnknownRecord | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") {
    return null;
  }
  return event.detail as UnknownRecord;
}

function recordOrNull(value: unknown): UnknownRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function recordField(record: UnknownRecord | null, field: string): UnknownRecord | null {
  if (record === null) {
    return null;
  }
  return recordOrNull(record[field]);
}

function arrayField(record: UnknownRecord | null, field: string): unknown[] {
  if (record === null) {
    return [];
  }
  const value = record[field];
  return Array.isArray(value) ? value : [];
}

function stringField(record: UnknownRecord | null, field: string): string {
  if (record === null) {
    return "";
  }
  const value = record[field];
  return typeof value === "string" ? value : "";
}

function numberField(record: UnknownRecord | null, field: string, fallback: number): number {
  if (record === null) {
    return fallback;
  }
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerField(record: UnknownRecord | null, field: string, fallback: number): number {
  return Math.trunc(numberField(record, field, fallback));
}

function booleanField(record: UnknownRecord | null, field: string, fallback: boolean): boolean {
  if (record === null) {
    return fallback;
  }
  const value = record[field];
  return typeof value === "boolean" ? value : fallback;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function movementOwnerKind(owner: UnknownRecord | null): string {
  return stringField(owner, "kind");
}

function nullableRoundedNumber(record: UnknownRecord, field: string): number | null {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? roundedNumber(value) : null;
}

function roundedNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function boundedStrings(values: readonly unknown[]): string[] {
  return uniqueStrings(values).slice(0, maxRecordedIds);
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const strings: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || value === "" || seen.has(value)) {
      continue;
    }
    seen.add(value);
    strings.push(value);
  }
  return strings;
}

function limitedItems<T>(
  items: readonly T[],
  path: string,
  limit: number,
  truncation: RendererGraphTruncation[],
  total = items.length,
): T[] {
  const limited = items.slice(0, limit);
  if (total > limit) {
    truncation.push({
      limit,
      omitted: total - limit,
      path,
      total,
    });
  }
  return limited;
}

function uniqueLayoutSaveOwners(
  owners: readonly RendererGraphLayoutSaveOwner[],
): RendererGraphLayoutSaveOwner[] {
  return [...new Set(owners)];
}

function summarizedLayoutSaveOwner(
  owners: readonly RendererGraphLayoutSaveOwner[],
): RendererGraphLayoutSaveEvent["layoutSave"]["owner"] {
  const uniqueOwners = uniqueLayoutSaveOwners(owners);
  if (uniqueOwners.length === 0) {
    return "none";
  }
  if (uniqueOwners.length === 1) {
    return uniqueOwners[0] ?? "none";
  }
  return "multiple";
}

function timestamp(): string {
  return new Date().toISOString();
}
