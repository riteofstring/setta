import type {
  SemanticActivityInterval,
  SemanticEvent,
  SemanticEventHistory,
  SemanticEvidenceAnchor,
  SemanticNodeDetail,
  SemanticWorkingSet,
  SemanticWorkingSetCandidateTarget,
  SemanticWorkingSetCartographerRun,
  SemanticWorkingSetCartographerWindow,
  SemanticWorkingSetLiveSourceRef,
  SemanticWorkingSetPatchPreview,
  SemanticWorkingSetPulse,
  SemanticWorkingSetSemanticChange,
  SemanticWorkingSetStatus,
} from "@generated/backend";
import type { ReactNode } from "react";

import { WorkflowDetailsRows, WorkflowDetailsSection } from "./workflow-node-details-components";
import { shortIdentifier } from "./workflow-node-details-helpers";

type SemanticContextSourceRefs = SemanticWorkingSetPulse["sourceRefs"];

const activeSemanticWorkingSetStatuses = new Set<SemanticWorkingSetStatus>([
  "observing",
  "window_open",
  "queued",
  "running",
  "proposing",
  "applying",
  "pending_review",
]);

export function SemanticOverviewSection({
  detail,
}: {
  detail: SemanticNodeDetail;
  history: SemanticEventHistory | null;
  workingSet: SemanticWorkingSet | null;
}) {
  const newestEvidence = semanticNewestEvidence(detail.evidence);
  return (
    <WorkflowDetailsSection title="Overview">
      <WorkflowDetailsRows
        rows={[
          { label: "Summary", value: detail.node.summary },
          { label: "Why", value: semanticWhyThisExists(detail) },
          { label: "Newest evidence", value: newestEvidenceText(newestEvidence) },
          { label: "Sources", value: semanticDetailSourceRefsText(detail) },
          { label: "Related", value: semanticRelatedNodesText(detail) },
          { label: "Patch", value: semanticPatchProvenanceText(detail) },
        ]}
      />
    </WorkflowDetailsSection>
  );
}

export function SemanticLiveStatusSection({
  detail,
  workingSet,
}: {
  detail: SemanticNodeDetail;
  workingSet: SemanticWorkingSet | null;
}) {
  const items = semanticLiveStatusItems(detail, workingSet);
  if (items.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Live Status">
      <div className="space-y-2" data-testid="semantic-live-status">
        {items.map((item) => (
          <SemanticRecord key={item.id}>
            <WorkflowDetailsRows
              rows={[
                { label: "Status", value: item.status },
                { label: "Kind", value: item.kind },
                { label: "Patch", value: shortIdentifier(item.patchId) },
                { label: "Run", value: shortIdentifier(item.runId) },
                { label: "Window", value: shortIdentifier(item.windowId) },
                { label: "Sources", value: semanticContextSourceRefsText(item.sourceRefs) },
                { label: "Operations", value: item.operations.join(", ") },
                { label: "Summary", value: item.summary },
                { label: "Updated", value: item.updatedAt },
              ]}
            />
          </SemanticRecord>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

export function SemanticRecentChangesSection({
  detail,
  history,
  workingSet,
}: {
  detail: SemanticNodeDetail;
  history: SemanticEventHistory | null;
  workingSet: SemanticWorkingSet | null;
}) {
  const items = semanticRecentChangeItems(detail, history?.events ?? [], workingSet);
  if (items.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Recent Changes">
      <div className="grid gap-2 text-xs sm:grid-cols-2" data-testid="semantic-recent-changes">
        {items.map((item) => (
          <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-3 py-2" key={item.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-zinc-200">{item.kind}</span>
              <span className="shrink-0 text-zinc-500">{item.time}</span>
            </div>
            <div className="mt-1 line-clamp-2 text-zinc-400">{item.summary}</div>
          </div>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

export function semanticContextSourceRefsText(refs: SemanticContextSourceRefs) {
  const entries: [string, string][] = [
    ["workflow definition", refs.workflowDefinitionId],
    ["workflow execution", refs.workflowExecutionId],
    ["workflow node", refs.workflowNodeId],
    ["workflow node execution", refs.workflowNodeExecutionId],
    ["chat conversation", refs.chatConversationId],
    ["chat run", refs.chatRunId],
    ["chat message", refs.chatMessageId],
    ["run item", refs.runItemId],
  ];
  return entries
    .filter(([, value]) => value !== "")
    .map(([label, value]) => `${label}: ${shortIdentifier(value)}`)
    .join("; ");
}

function SemanticRecord({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
      {children}
    </div>
  );
}

function semanticNewestEvidence(evidence: SemanticEvidenceAnchor[]) {
  return [...evidence].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function newestEvidenceText(anchor: SemanticEvidenceAnchor | undefined) {
  if (anchor === undefined) {
    return "";
  }
  return [anchor.summary, evidencePath(anchor), semanticEvidenceSourceText(anchor)]
    .filter((part) => part !== "")
    .join(" / ");
}

function semanticDetailSourceRefsText(detail: SemanticNodeDetail) {
  const refs: string[] = [];
  const push = (value: string) => pushUniqueNonEmpty(refs, value);
  for (const anchor of detail.evidence) {
    push(semanticEvidenceSourceText(anchor));
  }
  for (const interval of detail.activity) {
    push(semanticActivitySourceText(interval));
  }
  for (const patch of detail.cartographerPatches) {
    push(semanticContextSourceRefsText(patch.patch.sourceRefs));
  }
  for (const pack of detail.contextPackHistory) {
    push(semanticContextSourceRefsText(pack.sourceRefs));
  }
  return refs.slice(0, 5).join("; ");
}

function semanticEvidenceSourceText(anchor: SemanticEvidenceAnchor) {
  const primary = anchor.sourceId || evidencePath(anchor) || anchor.uri;
  const refs = [
    primary === "" ? anchor.sourceKind : `${anchor.sourceKind}: ${shortIdentifier(primary)}`,
    anchor.workflowNodeId === "" ? "" : `workflow node: ${shortIdentifier(anchor.workflowNodeId)}`,
    anchor.runItemId === "" ? "" : `run item: ${shortIdentifier(anchor.runItemId)}`,
    anchor.chatRunId === "" ? "" : `chat run: ${shortIdentifier(anchor.chatRunId)}`,
    anchor.chatMessageId === "" ? "" : `chat message: ${shortIdentifier(anchor.chatMessageId)}`,
  ].filter((value) => value !== "");
  return refs.join(", ");
}

function semanticActivitySourceText(interval: SemanticActivityInterval) {
  return [
    interval.sourceId === ""
      ? interval.sourceKind
      : `${interval.sourceKind}: ${shortIdentifier(interval.sourceId)}`,
    interval.workflowNodeId === ""
      ? ""
      : `workflow node: ${shortIdentifier(interval.workflowNodeId)}`,
    interval.runItemId === "" ? "" : `run item: ${shortIdentifier(interval.runItemId)}`,
    interval.chatRunId === "" ? "" : `chat run: ${shortIdentifier(interval.chatRunId)}`,
  ]
    .filter((value) => value !== "")
    .join(", ");
}

function semanticRelatedNodesText(detail: SemanticNodeDetail) {
  const related = [
    ...detail.incomingEdges.map((edge) => `${shortIdentifier(edge.fromNodeId)} -> ${edge.kind}`),
    ...detail.outgoingEdges.map((edge) => `${edge.kind} -> ${shortIdentifier(edge.toNodeId)}`),
    detail.node.splitFromNodeId === ""
      ? ""
      : `split from ${shortIdentifier(detail.node.splitFromNodeId)}`,
    ...detail.node.splitIntoNodeIds.map((nodeId) => `split into ${shortIdentifier(nodeId)}`),
    detail.node.mergedIntoNodeId === ""
      ? ""
      : `merged into ${shortIdentifier(detail.node.mergedIntoNodeId)}`,
  ].filter((value) => value !== "");
  return related.join("; ");
}

function semanticPatchProvenanceText(detail: SemanticNodeDetail) {
  const patch = [...detail.cartographerPatches].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )[0];
  if (patch === undefined) {
    return "";
  }
  return [
    patch.status,
    patch.patch.operation,
    shortIdentifier(patch.runId),
    patch.patch.publicSummary,
  ]
    .filter((value) => value !== "")
    .join(" / ");
}

interface SemanticLiveStatusItem {
  id: string;
  kind: string;
  operations: string[];
  patchId: string;
  runId: string;
  sourceRefs: SemanticContextSourceRefs;
  status: SemanticWorkingSetStatus;
  summary: string;
  updatedAt: string;
  windowId: string;
}

function semanticLiveStatusItems(
  detail: SemanticNodeDetail,
  workingSet: SemanticWorkingSet | null,
) {
  if (workingSet === null) {
    return [];
  }
  const nodeId = detail.node.id;
  const evidenceIds = semanticDetailEvidenceIds(detail);
  const edgeIds = semanticDetailEdgeIds(detail);
  const items: SemanticLiveStatusItem[] = [];
  items.push(
    ...workingSet.activeCartographerWindows
      .filter((window) => semanticWorkingSetTargetTouchesNode(window, nodeId))
      .filter((window) => semanticWorkingSetStatusIsActive(window.status))
      .map((window) => semanticLiveStatusFromWindow(window)),
    ...workingSet.activeCartographerRuns
      .filter((run) => semanticWorkingSetTargetTouchesNode(run, nodeId))
      .filter((run) => semanticWorkingSetStatusIsActive(run.status))
      .map((run) => semanticLiveStatusFromRun(run)),
    ...workingSet.candidateTargets
      .filter((candidate) => semanticWorkingSetTargetTouchesNode(candidate, nodeId))
      .filter((candidate) => semanticWorkingSetStatusIsActive(candidate.status))
      .map((candidate) => semanticLiveStatusFromCandidate(candidate)),
    ...workingSet.pendingPatchPreviews
      .filter((preview) => semanticWorkingSetPreviewTouchesNode(preview, nodeId))
      .filter((preview) => semanticWorkingSetStatusIsActive(preview.status))
      .map((preview) => semanticLiveStatusFromPreview(preview)),
    ...workingSet.liveSourceRefs
      .filter((source) => semanticWorkingSetTargetTouchesNode(source, nodeId))
      .filter((source) => semanticWorkingSetStatusIsActive(source.status))
      .map((source) => semanticLiveStatusFromSource(source)),
    ...workingSet.pulses
      .filter((pulse) => semanticWorkingSetPulseTouchesDetail(pulse, nodeId, evidenceIds, edgeIds))
      .filter((pulse) => semanticWorkingSetStatusIsActive(pulse.status))
      .map((pulse) => semanticLiveStatusFromPulse(pulse)),
  );
  return dedupeById(items)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 6);
}

function semanticRecentChangeItems(
  detail: SemanticNodeDetail,
  events: SemanticEvent[],
  workingSet: SemanticWorkingSet | null,
) {
  const nodeId = detail.node.id;
  const evidenceIds = semanticDetailEvidenceIds(detail);
  const edgeIds = semanticDetailEdgeIds(detail);
  const items: { id: string; kind: string; summary: string; time: string }[] = [];
  if (workingSet !== null) {
    items.push(
      ...workingSet.recentSemanticChanges
        .filter((change) => semanticWorkingSetTargetTouchesNode(change, nodeId))
        .map((change) => ({
          id: change.id,
          kind: change.patchOperationNames[0] ?? "semantic change",
          summary: change.publicSummary || shortIdentifierList(change.createdSemanticEventIds),
          time: change.occurredAt,
        })),
      ...workingSet.pulses
        .filter((pulse) =>
          semanticWorkingSetPulseTouchesDetail(pulse, nodeId, evidenceIds, edgeIds),
        )
        .map((pulse) => ({
          id: pulse.id,
          kind: pulse.kind,
          summary: pulse.publicSummary || semanticContextSourceRefsText(pulse.sourceRefs),
          time: pulse.occurredAt || pulse.updatedAt,
        })),
    );
  }
  items.push(
    ...detail.evidence.map((anchor) => ({
      id: anchor.id,
      kind: "evidence",
      summary: anchor.summary || evidencePath(anchor) || semanticEvidenceSourceText(anchor),
      time: anchor.createdAt,
    })),
    ...detail.cartographerPatches.map((patch) => ({
      id: patch.id,
      kind: patch.patch.operation,
      summary: patch.patch.publicSummary || patch.status,
      time: patch.appliedAt || patch.validatedAt || patch.createdAt,
    })),
    ...events.map((event) => ({
      id: event.eventId,
      kind: event.eventType,
      summary: event.actorId === "" ? event.actorKind : `${event.actorKind}:${event.actorId}`,
      time: event.observedAt,
    })),
  );
  return dedupeById(items)
    .filter((item) => item.summary !== "" || item.kind !== "")
    .sort((left, right) => right.time.localeCompare(left.time))
    .slice(0, 6);
}

function semanticDetailEvidenceIds(detail: SemanticNodeDetail) {
  return new Set(detail.evidence.map((anchor) => anchor.id));
}

function semanticDetailEdgeIds(detail: SemanticNodeDetail) {
  return new Set([...detail.incomingEdges, ...detail.outgoingEdges].map((edge) => edge.id));
}

function semanticWorkingSetStatusIsActive(status: SemanticWorkingSetStatus) {
  return activeSemanticWorkingSetStatuses.has(status);
}

function semanticWorkingSetTargetTouchesNode(
  item:
    | SemanticWorkingSetCandidateTarget
    | SemanticWorkingSetCartographerRun
    | SemanticWorkingSetCartographerWindow
    | SemanticWorkingSetLiveSourceRef
    | SemanticWorkingSetSemanticChange,
  nodeId: string,
) {
  return item.targetEntityId === nodeId || item.changedSemanticNodeIds.includes(nodeId);
}

function semanticWorkingSetPreviewTouchesNode(
  preview: SemanticWorkingSetPatchPreview,
  nodeId: string,
) {
  return (
    preview.targetEntityId === nodeId ||
    preview.changedSemanticNodeIds.includes(nodeId) ||
    preview.newNodes.some((node) => node.semanticNodeId === nodeId)
  );
}

function semanticWorkingSetPulseTouchesDetail(
  pulse: SemanticWorkingSetPulse,
  nodeId: string,
  evidenceIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string>,
) {
  return (
    pulse.targetEntityId === nodeId ||
    pulse.semanticNodeIds.includes(nodeId) ||
    pulse.evidenceAnchorIds.some((id) => evidenceIds.has(id)) ||
    pulse.semanticEdgeIds.some((id) => edgeIds.has(id))
  );
}

function semanticLiveStatusFromWindow(
  window: SemanticWorkingSetCartographerWindow,
): SemanticLiveStatusItem {
  return {
    id: `window:${window.id}`,
    kind: "cartographer window",
    operations: window.patchOperationNames,
    patchId: "",
    runId: window.runId,
    sourceRefs: window.sourceRefs,
    status: window.status,
    summary: window.publicSummary,
    updatedAt: window.updatedAt,
    windowId: window.id,
  };
}

function semanticLiveStatusFromRun(run: SemanticWorkingSetCartographerRun): SemanticLiveStatusItem {
  return {
    id: `run:${run.id}`,
    kind: "cartographer run",
    operations: run.patchOperationNames,
    patchId: "",
    runId: run.id,
    sourceRefs: run.sourceRefs,
    status: run.status,
    summary: run.publicSummary,
    updatedAt: run.updatedAt,
    windowId: run.windowId,
  };
}

function semanticLiveStatusFromCandidate(
  candidate: SemanticWorkingSetCandidateTarget,
): SemanticLiveStatusItem {
  return {
    id: `candidate:${candidate.targetEntityId}:${candidate.updatedAt}`,
    kind: "candidate target",
    operations: candidate.patchOperationNames,
    patchId: candidate.patchIds[0] ?? "",
    runId: candidate.runIds[0] ?? "",
    sourceRefs: candidate.sourceRefs,
    status: candidate.status,
    summary: candidate.publicSummaries.find((summary) => summary !== "") ?? "",
    updatedAt: candidate.updatedAt,
    windowId: candidate.windowIds[0] ?? "",
  };
}

function semanticLiveStatusFromPreview(
  preview: SemanticWorkingSetPatchPreview,
): SemanticLiveStatusItem {
  return {
    id: `preview:${preview.id}`,
    kind: "patch preview",
    operations: preview.patchOperationNames,
    patchId: preview.patchId,
    runId: preview.runId,
    sourceRefs: preview.sourceRefs,
    status: preview.status,
    summary: preview.publicSummary,
    updatedAt: preview.updatedAt,
    windowId: preview.windowId,
  };
}

function semanticLiveStatusFromSource(
  source: SemanticWorkingSetLiveSourceRef,
): SemanticLiveStatusItem {
  return {
    id: `source:${source.id}`,
    kind: "live source",
    operations: source.patchOperationNames,
    patchId: source.patchId,
    runId: source.runId,
    sourceRefs: source.sourceRefs,
    status: source.status,
    summary: source.publicSummary,
    updatedAt: source.updatedAt,
    windowId: source.windowId,
  };
}

function semanticLiveStatusFromPulse(pulse: SemanticWorkingSetPulse): SemanticLiveStatusItem {
  return {
    id: `pulse:${pulse.id}`,
    kind: pulse.kind,
    operations: pulse.patchOperationNames,
    patchId: pulse.patchId,
    runId: pulse.runId,
    sourceRefs: pulse.sourceRefs,
    status: pulse.status,
    summary: pulse.publicSummary,
    updatedAt: pulse.updatedAt,
    windowId: pulse.windowId,
  };
}

function semanticWhyThisExists(detail: SemanticNodeDetail) {
  const patchSummary = detail.cartographerPatches.find((patch) => patch.patch.publicSummary !== "")
    ?.patch.publicSummary;
  if (patchSummary !== undefined) {
    return patchSummary;
  }
  const evidenceSummary = detail.evidence.find((anchor) => anchor.summary !== "")?.summary;
  return evidenceSummary ?? detail.node.summary;
}

function evidencePath(anchor: SemanticEvidenceAnchor) {
  if (anchor.path === "") {
    return "";
  }
  if (anchor.rangeStart === 0 && anchor.rangeEnd === 0) {
    return anchor.path;
  }
  return `${anchor.path}:${anchor.rangeStart}-${anchor.rangeEnd}`;
}

function shortIdentifierList(values: string[]) {
  return values
    .filter((value) => value !== "")
    .map(shortIdentifier)
    .join(", ");
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function pushUniqueNonEmpty(values: string[], value: string) {
  if (value === "" || values.includes(value)) {
    return;
  }
  values.push(value);
}
