import type {
  CartographerCursor,
  CartographerDiagnostic,
  CartographerPatchRecord,
  CartographerRun,
  CartographerWindow,
  SemanticActivityInterval,
  SemanticEdge,
  SemanticEvent,
  SemanticEventHistory,
  SemanticEvidenceAnchor,
  SemanticNodeDetail,
  SemanticSteeringDirective,
  SemanticWorkingSet,
} from "@generated/backend";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SemanticEditControls } from "./semantic-node-edit-controls";
import { semanticWorkingSetFromRuntimeSnapshot } from "./semantic-graph-state";
import { semanticGraphChangeAffectsSemanticNodeInspection } from "./semantic-node-details-invalidation";
import { SemanticSourceLinkSection } from "./semantic-node-source-links";
import {
  SemanticLiveStatusSection,
  SemanticOverviewSection,
  SemanticRecentChangesSection,
  semanticContextSourceRefsText,
} from "./semantic-node-details-usefulness";
import {
  WorkflowDetailsEmpty,
  WorkflowDetailsError,
  WorkflowDetailsRows,
  WorkflowDetailsSection,
} from "./workflow-node-details-components";
import { shortIdentifier } from "./workflow-node-details-helpers";
import { useSemanticGraphStore } from "../../stores/semantic-graph-store";

type SemanticNodeDetailsTarget = NonNullable<
  ReturnType<typeof useSemanticGraphStore.getState>["selectedNodeTarget"]
>;
type SemanticContextPack = SemanticNodeDetail["contextPackHistory"][number];
type SemanticContextPackItem = SemanticContextPack["items"][number];
type CartographerPatch = CartographerPatchRecord["patch"];

interface SemanticNodeInspectionState {
  detail: SemanticNodeDetail | null;
  history: SemanticEventHistory | null;
  loadError: string;
  loading: boolean;
  reload: () => void;
  workingSet: SemanticWorkingSet | null;
}

const semanticEventHistoryLimit = 80;
const semanticRuntimeInspectionLimit = 80;

export function SemanticNodeDetailsSurface() {
  const target = useSemanticGraphStore((state) => state.selectedNodeTarget);
  const inspection = useSemanticNodeInspection(target);
  const title = inspection.detail?.node.label ?? target?.nodeLabel ?? "Semantic Node";
  const subtitle =
    inspection.detail === null
      ? (target?.nodeKind ?? "semantic node")
      : `${inspection.detail.node.kind} / ${semanticStatus(inspection.detail)}`;
  return (
    <SemanticDetailsShell subtitle={subtitle} title={title}>
      <SemanticNodeDetailsContent inspection={inspection} target={target} />
    </SemanticDetailsShell>
  );
}

function useSemanticNodeInspection(target: SemanticNodeDetailsTarget | null) {
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);
  const [state, setState] = useState<SemanticNodeInspectionState>(() => ({
    detail: null,
    history: null,
    loadError: "",
    loading: false,
    reload,
    workingSet: null,
  }));

  useEffect(() => {
    let disposed = false;
    let refreshQueued = false;
    let loadedDetail: SemanticNodeDetail | null = null;
    setState({
      detail: null,
      history: null,
      loadError: "",
      loading: target !== null,
      reload,
      workingSet: null,
    });
    if (target === null) {
      return;
    }

    const scheduleRefresh = () => {
      if (refreshQueued) {
        return;
      }
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (!disposed) {
          setReloadKey((value) => value + 1);
        }
      });
    };

    const load = async () => {
      const [detailResponse, history, runtimeSnapshot] = await Promise.all([
        window.setta.semanticGraph.readNodeDetail({
          nodeId: target.nodeId,
          workspaceId: target.workspaceId,
        }),
        window.setta.semanticGraph.readEventHistory({
          beforeLogicalClock: 0,
          limit: semanticEventHistoryLimit,
          targetEntityId: target.nodeId,
          workspaceId: target.workspaceId,
        }),
        window.setta.semanticGraph.readRuntimeSnapshot({
          chatRunId: "",
          limit: semanticRuntimeInspectionLimit,
          workflowExecutionId: "",
          workspaceId: target.workspaceId,
        }),
      ]);
      const workingSet = semanticWorkingSetFromRuntimeSnapshot(runtimeSnapshot);
      if (!disposed) {
        loadedDetail = detailResponse.detail;
        setState({
          detail: detailResponse.detail,
          history,
          loadError: "",
          loading: false,
          reload,
          workingSet,
        });
      }
    };
    void load().catch((error: unknown) => {
      if (!disposed) {
        setState({
          detail: null,
          history: null,
          loadError: errorMessage(error),
          loading: false,
          reload,
          workingSet: null,
        });
      }
    });
    const unsubscribe = window.setta.semanticGraph.onEvent((event) => {
      if (semanticGraphChangeAffectsSemanticNodeInspection(event, target, loadedDetail)) {
        scheduleRefresh();
      }
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [target, reload, reloadKey]);

  return state;
}

function SemanticNodeDetailsContent({
  inspection,
  target,
}: {
  inspection: SemanticNodeInspectionState;
  target: SemanticNodeDetailsTarget | null;
}) {
  if (target === null) {
    return <WorkflowDetailsEmpty message="Select a semantic node to inspect it." />;
  }
  if (inspection.loadError !== "") {
    return <WorkflowDetailsError message={inspection.loadError} />;
  }
  if (inspection.loading) {
    return <WorkflowDetailsEmpty message="Loading semantic node details" />;
  }
  if (inspection.detail === null) {
    return <WorkflowDetailsEmpty message="The selected semantic node no longer exists." />;
  }
  return (
    <SemanticLoadedNodeDetails
      detail={inspection.detail}
      history={inspection.history}
      onMutation={inspection.reload}
      workingSet={inspection.workingSet}
    />
  );
}

export function SemanticLoadedNodeDetails({
  detail,
  history,
  onMutation,
  workingSet = null,
}: {
  detail: SemanticNodeDetail;
  history: SemanticEventHistory | null;
  onMutation?: () => void;
  workingSet?: SemanticWorkingSet | null;
}) {
  const confidence = useMemo(() => latestConfidence(history?.events ?? []), [history]);
  const node = detail.node;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="semantic-node-details"
    >
      <WorkflowDetailsSection title="Semantic Node">
        <WorkflowDetailsRows
          rows={[
            { label: "Label", value: node.label },
            { label: "Kind", value: node.kind },
            { label: "Status", value: semanticStatus(detail) },
            { label: "Confidence", value: confidence, hidden: confidence === "" },
            { label: "Created", value: node.createdAt },
            { label: "Updated", value: node.updatedAt },
            { label: "Id", value: node.id },
            { label: "Why this exists", value: semanticWhyThisExists(detail) },
            { label: "Summary", value: node.summary },
          ]}
        />
      </WorkflowDetailsSection>
      <SemanticOverviewSection detail={detail} history={history} workingSet={workingSet} />
      <SemanticLiveStatusSection detail={detail} workingSet={workingSet} />
      <SemanticRecentChangesSection detail={detail} history={history} workingSet={workingSet} />
      <SemanticEditControls detail={detail} onMutation={onMutation} />
      <SemanticLineageSection detail={detail} />
      <SemanticSourceLinkSection evidence={detail.evidence} />
      <SemanticEdgeSection incoming={detail.incomingEdges} outgoing={detail.outgoingEdges} />
      <SemanticCartographerSection detail={detail} onMutation={onMutation} />
      <SemanticEvidenceSection evidence={detail.evidence} />
      <SemanticActivitySection activity={detail.activity} />
      <SemanticSteeringSection directives={detail.steeringDirectives} />
      <SemanticContextPackSection contextPacks={detail.contextPackHistory} />
      <SemanticHistorySection history={history} />
    </div>
  );
}

function SemanticCartographerSection({
  detail,
  onMutation,
}: {
  detail: SemanticNodeDetail;
  onMutation?: () => void;
}) {
  const [pendingPatchId, setPendingPatchId] = useState("");
  const [reviewError, setReviewError] = useState("");
  const hasCartographerState =
    detail.cartographerPatches.length > 0 ||
    detail.cartographerRuns.length > 0 ||
    detail.cartographerWindows.length > 0 ||
    detail.cartographerCursors.length > 0;
  if (!hasCartographerState) {
    return null;
  }
  const reviewPatch = async (patch: CartographerPatchRecord, action: "accept" | "reject") => {
    setPendingPatchId(patch.id);
    setReviewError("");
    try {
      if (action === "accept") {
        await window.setta.semanticGraph.acceptCartographerPatch({
          patchId: patch.id,
          workspaceId: detail.workspaceId,
        });
      } else {
        await window.setta.semanticGraph.rejectCartographerPatch({
          patchId: patch.id,
          workspaceId: detail.workspaceId,
        });
      }
      onMutation?.();
    } catch (error) {
      setReviewError(errorMessage(error));
    } finally {
      setPendingPatchId("");
    }
  };
  return (
    <WorkflowDetailsSection title="Cartographer">
      <div className="space-y-3" data-testid="semantic-cartographer-section">
        <CartographerPatchList
          patches={detail.cartographerPatches}
          pendingPatchId={pendingPatchId}
          reviewPatch={reviewPatch}
        />
        <CartographerRunList runs={detail.cartographerRuns} />
        <CartographerWindowList windows={detail.cartographerWindows} />
        <CartographerCursorList cursors={detail.cartographerCursors} />
        {reviewError !== "" ? <div className="text-xs text-rose-300">{reviewError}</div> : null}
      </div>
    </WorkflowDetailsSection>
  );
}

function CartographerPatchList({
  patches,
  pendingPatchId,
  reviewPatch,
}: {
  patches: CartographerPatchRecord[];
  pendingPatchId: string;
  reviewPatch: (patch: CartographerPatchRecord, action: "accept" | "reject") => Promise<void>;
}) {
  if (patches.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-zinc-400">Patches</div>
      {patches.map((patch) => (
        <SemanticRecord key={patch.id}>
          <div className="space-y-2" data-testid="cartographer-patch-record">
            <WorkflowDetailsRows
              rows={[
                { label: "Operation", value: patch.patch.operation },
                { label: "Status", value: patch.status },
                { label: "Confidence", value: cartographerConfidenceText(patch) },
                { label: "Review required", value: patch.patch.reviewRequired ? "yes" : "no" },
                { label: "Run", value: shortIdentifier(patch.runId) },
                { label: "Window", value: shortIdentifier(patch.windowId) },
                { label: "Target", value: cartographerPatchTargetText(patch.patch) },
                { label: "Sources", value: semanticContextSourceRefsText(patch.patch.sourceRefs) },
                { label: "Summary", value: patch.patch.publicSummary },
                {
                  label: "Created events",
                  value: shortIdentifierList(patch.createdSemanticEventIds),
                },
                { label: "Created", value: patch.createdAt },
                { label: "Validated", value: patch.validatedAt },
                { label: "Applied", value: patch.appliedAt },
              ]}
            />
            <CartographerDiagnostics diagnostics={cartographerPatchDiagnostics(patch)} />
            {patch.status === "pending_review" ? (
              <CartographerReviewActions
                disabled={pendingPatchId !== ""}
                loading={pendingPatchId === patch.id}
                onAccept={() => void reviewPatch(patch, "accept")}
                onReject={() => void reviewPatch(patch, "reject")}
              />
            ) : null}
          </div>
        </SemanticRecord>
      ))}
    </div>
  );
}

function CartographerReviewActions({
  disabled,
  loading,
  onAccept,
  onReject,
}: {
  disabled: boolean;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-zinc-900 pt-2">
      <button
        className="inline-flex items-center gap-1 rounded-sm border border-emerald-900 bg-emerald-950/40 px-2 py-1 text-xs font-medium text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="cartographer-patch-accept"
        disabled={disabled}
        onClick={onAccept}
        type="button"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {loading ? "Applying" : "Accept"}
      </button>
      <button
        className="inline-flex items-center gap-1 rounded-sm border border-rose-900 bg-rose-950/40 px-2 py-1 text-xs font-medium text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="cartographer-patch-reject"
        disabled={disabled}
        onClick={onReject}
        type="button"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Reject
      </button>
    </div>
  );
}

function CartographerDiagnostics({ diagnostics }: { diagnostics: CartographerDiagnostic[] }) {
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1 border-t border-zinc-900 pt-2">
      <div className="text-xs font-medium text-zinc-400">Diagnostics</div>
      {diagnostics.map((diagnostic) => (
        <WorkflowDetailsRows
          key={diagnostic.id}
          rows={[
            { label: "Severity", value: diagnostic.severity },
            { label: "Code", value: diagnostic.code },
            { label: "Message", value: diagnostic.message },
            { label: "Path", value: diagnostic.path },
          ]}
        />
      ))}
    </div>
  );
}

function CartographerRunList({ runs }: { runs: CartographerRun[] }) {
  if (runs.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-zinc-400">Runs</div>
      {runs.map((run) => (
        <SemanticRecord key={run.id}>
          <WorkflowDetailsRows
            rows={[
              { label: "Status", value: run.status },
              { label: "Trigger", value: run.triggerKind },
              { label: "Run", value: shortIdentifier(run.id) },
              { label: "Window", value: shortIdentifier(run.windowId) },
              { label: "Target", value: shortIdentifier(run.targetEntityId) },
              { label: "Sources", value: semanticContextSourceRefsText(run.sourceRefs) },
              { label: "Summary", value: run.trajectorySummary },
              { label: "Input hash", value: run.inputBundleHash },
              { label: "Response hash", value: run.rawHarnessResponseHash },
              { label: "Created events", value: shortIdentifierList(run.createdSemanticEventIds) },
              { label: "Updated", value: run.updatedAt },
            ]}
          />
        </SemanticRecord>
      ))}
    </div>
  );
}

function CartographerWindowList({ windows }: { windows: CartographerWindow[] }) {
  if (windows.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-zinc-400">Windows</div>
      {windows.map((window) => (
        <SemanticRecord key={window.id}>
          <WorkflowDetailsRows
            rows={[
              { label: "Status", value: window.status },
              {
                label: "Source",
                value: `${window.sourceKind}:${shortIdentifier(window.sourceId)}`,
              },
              { label: "Run", value: shortIdentifier(window.runId) },
              { label: "Cursor", value: shortIdentifier(window.cursorId) },
              { label: "Summary", value: cartographerWindowSummary(window) },
              {
                label: "Start cursor",
                value: cartographerWindowCursorText(window.inputBundle.windowStartCursor),
              },
              {
                label: "End cursor",
                value: cartographerWindowCursorText(window.inputBundle.windowEndCursor),
              },
              { label: "Opened", value: window.openedAt },
              { label: "Closed", value: window.closedAt },
            ]}
          />
        </SemanticRecord>
      ))}
    </div>
  );
}

function CartographerCursorList({ cursors }: { cursors: CartographerCursor[] }) {
  if (cursors.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-zinc-400">Cursors</div>
      {cursors.map((cursor) => (
        <SemanticRecord key={cursor.id}>
          <WorkflowDetailsRows
            rows={[
              { label: "Workflow execution", value: shortIdentifier(cursor.workflowExecutionId) },
              { label: "Chat run", value: shortIdentifier(cursor.chatRunId) },
              {
                label: "Last chat",
                value:
                  cursor.lastChatEventStreamId === ""
                    ? ""
                    : `${cursor.lastChatEventStreamId}:${cursor.lastChatEventSequence}`,
              },
              { label: "Last workflow", value: cursor.lastWorkflowEventCursor },
              { label: "Last window", value: shortIdentifier(cursor.lastWindowId) },
              {
                label: "Output ordinals",
                value: cartographerOutputOrdinalsText(cursor.lastOutputOrdinalByRunItem),
              },
              { label: "Updated", value: cursor.updatedAt },
            ]}
          />
        </SemanticRecord>
      ))}
    </div>
  );
}

function SemanticLineageSection({ detail }: { detail: SemanticNodeDetail }) {
  const node = detail.node;
  const lineageRows = [
    { label: "Split from", value: node.splitFromNodeId },
    { label: "Split into", value: node.splitIntoNodeIds.join(", ") },
    { label: "Merged into", value: node.mergedIntoNodeId },
    { label: "Created by", value: shortIdentifier(node.createdByEventId) },
    { label: "Updated by", value: shortIdentifier(node.updatedByEventId) },
  ];
  return (
    <WorkflowDetailsSection title="Lineage">
      <WorkflowDetailsRows rows={lineageRows} />
    </WorkflowDetailsSection>
  );
}

function SemanticEdgeSection({
  incoming,
  outgoing,
}: {
  incoming: SemanticEdge[];
  outgoing: SemanticEdge[];
}) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Edges">
      <SemanticEdgeList edges={incoming} title="Incoming" />
      <SemanticEdgeList edges={outgoing} title="Outgoing" />
    </WorkflowDetailsSection>
  );
}

function SemanticEdgeList({ edges, title }: { edges: SemanticEdge[]; title: string }) {
  if (edges.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400">{title}</div>
      {edges.map((edge) => (
        <SemanticRecord key={edge.id}>
          <WorkflowDetailsRows
            rows={[
              { label: "Kind", value: edge.kind },
              { label: "From", value: edge.fromNodeId },
              { label: "To", value: edge.toNodeId },
              { label: "Label", value: edge.label },
              { label: "Summary", value: edge.summary },
            ]}
          />
        </SemanticRecord>
      ))}
    </div>
  );
}

function SemanticEvidenceSection({ evidence }: { evidence: SemanticEvidenceAnchor[] }) {
  if (evidence.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Evidence">
      <div className="space-y-2">
        {evidence.map((anchor) => (
          <SemanticRecord key={anchor.id}>
            <WorkflowDetailsRows
              rows={[
                { label: "Source", value: anchor.sourceKind },
                { label: "Ref", value: anchor.sourceId || anchor.uri },
                { label: "Workflow definition", value: anchor.workflowDefinitionId },
                { label: "Workflow execution", value: anchor.workflowExecutionId },
                { label: "Workflow node", value: anchor.workflowNodeId },
                { label: "Workflow node execution", value: anchor.workflowNodeExecutionId },
                { label: "Chat conversation", value: anchor.chatConversationId },
                { label: "Chat run", value: anchor.chatRunId },
                { label: "Chat message", value: anchor.chatMessageId },
                { label: "Run item", value: anchor.runItemId },
                { label: "Reassigned from", value: anchor.reassignedFromAnchorId },
                { label: "Path", value: evidencePath(anchor) },
                { label: "Summary", value: anchor.summary },
                { label: "Text", value: anchor.text },
                { label: "Content hash", value: anchor.contentHash },
                { label: "Created", value: anchor.createdAt },
              ]}
            />
          </SemanticRecord>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function SemanticActivitySection({ activity }: { activity: SemanticActivityInterval[] }) {
  if (activity.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Activity">
      <div className="space-y-2">
        {activity.map((interval) => (
          <SemanticRecord key={interval.id}>
            <WorkflowDetailsRows
              rows={[
                { label: "Kind", value: interval.kind },
                { label: "State", value: interval.endedAt === "" ? "active" : "ended" },
                { label: "Source", value: interval.sourceKind },
                { label: "Source id", value: interval.sourceId },
                { label: "Evidence", value: interval.evidenceAnchorId },
                { label: "Workflow definition", value: interval.workflowDefinitionId },
                { label: "Workflow execution", value: interval.workflowExecutionId },
                { label: "Workflow node", value: interval.workflowNodeId },
                { label: "Workflow node execution", value: interval.workflowNodeExecutionId },
                { label: "Chat conversation", value: interval.chatConversationId },
                { label: "Chat run", value: interval.chatRunId },
                { label: "Chat message", value: interval.chatMessageId },
                { label: "Run item", value: interval.runItemId },
                { label: "Reassigned from", value: interval.reassignedFromIntervalId },
                { label: "Actor", value: activityActor(interval) },
                { label: "Summary", value: interval.summary },
                { label: "Started", value: interval.startedAt },
                { label: "Ended", value: interval.endedAt },
              ]}
            />
          </SemanticRecord>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function SemanticSteeringSection({ directives }: { directives: SemanticSteeringDirective[] }) {
  if (directives.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Steering">
      <div className="space-y-2">
        {directives.map((directive) => (
          <SemanticRecord key={directive.id}>
            <WorkflowDetailsRows
              rows={[
                { label: "Kind", value: directive.kind },
                { label: "Status", value: directive.status },
                { label: "Scope", value: directive.scope },
                { label: "Instruction", value: directive.instruction },
                { label: "Workflow definition", value: directive.workflowDefinitionId },
                { label: "Workflow execution", value: directive.workflowExecutionId },
                { label: "Workflow node", value: directive.workflowNodeId },
                { label: "Chat run", value: directive.chatRunId },
                { label: "Chat message", value: directive.chatMessageId },
                { label: "Run item", value: directive.runItemId },
                { label: "Supersedes", value: directive.supersedesDirectiveId },
                { label: "Reassigned from", value: directive.reassignedFromDirectiveId },
                { label: "Updated", value: directive.updatedAt },
                { label: "Completed", value: directive.completedAt },
              ]}
            />
          </SemanticRecord>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function SemanticContextPackSection({
  contextPacks,
}: {
  contextPacks: SemanticNodeDetail["contextPackHistory"];
}) {
  if (contextPacks.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Context Packs">
      <div className="space-y-2">
        {contextPacks.map((pack) => (
          <SemanticRecord key={pack.id}>
            <WorkflowDetailsRows
              rows={[
                { label: "Trigger", value: pack.triggerKind },
                { label: "Target", value: shortIdentifier(pack.targetEntityId) },
                { label: "Items", value: `${pack.itemCount}` },
                { label: "Estimated", value: `${pack.estimatedTokens}` },
                { label: "Budget", value: `${pack.tokenBudget}` },
                { label: "Authored", value: pack.authoredPromptHash },
                { label: "Delivered", value: pack.deliveredContextHash },
                { label: "Sources", value: semanticContextSourceRefsText(pack.sourceRefs) },
                { label: "Created", value: pack.createdAt },
              ]}
            />
            <SemanticContextPackItems items={pack.items} />
            <SemanticContextPackDeliveredContext context={pack.deliveredContext} />
          </SemanticRecord>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function SemanticContextPackItems({ items }: { items: SemanticContextPackItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 space-y-2 border-t border-zinc-900 pt-2">
      <div className="text-xs font-medium text-zinc-400">Items</div>
      {items.map((item) => (
        <div
          className="space-y-1 border-t border-zinc-900 pt-2 first:border-t-0 first:pt-0"
          key={item.itemId}
        >
          <WorkflowDetailsRows
            rows={[
              { label: "Kind", value: item.kind },
              { label: "Title", value: item.title },
              { label: "Priority", value: item.priority },
              { label: "Reason", value: item.reasonIncluded },
              { label: "Summary", value: item.summary },
              { label: "Node", value: shortIdentifier(item.semanticNodeId) },
              { label: "Evidence", value: shortIdentifier(item.evidenceAnchorId) },
              { label: "Activity", value: shortIdentifier(item.activityIntervalId) },
              { label: "Steering", value: shortIdentifier(item.steeringDirectiveId) },
              { label: "Sources", value: semanticContextSourceRefsText(item.sourceRefs) },
              { label: "Tokens", value: `${item.estimatedTokens}` },
            ]}
          />
        </div>
      ))}
    </div>
  );
}

function SemanticContextPackDeliveredContext({ context }: { context: string }) {
  if (context === "") {
    return null;
  }
  return (
    <div className="mt-3 space-y-1 border-t border-zinc-900 pt-2">
      <div className="text-xs font-medium text-zinc-400">Delivered Context</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-[11px] leading-4 text-zinc-300">
        {context}
      </pre>
    </div>
  );
}

function SemanticHistorySection({ history }: { history: SemanticEventHistory | null }) {
  if (history === null || history.events.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="History">
      <div className="space-y-2">
        {history.events.map((event) => (
          <SemanticRecord key={event.eventId}>
            <WorkflowDetailsRows
              rows={[
                { label: "Event", value: event.eventType },
                { label: "Clock", value: `${event.logicalClock}` },
                { label: "Actor", value: event.actorKind },
                { label: "Observed", value: event.observedAt },
                {
                  label: "Confidence",
                  value: event.confidence === null ? "" : `${event.confidence}`,
                },
                { label: "Id", value: shortIdentifier(event.eventId) },
              ]}
            />
          </SemanticRecord>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function SemanticRecord({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
      {children}
    </div>
  );
}

function SemanticDetailsShell({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100"
      data-testid="semantic-node-details-surface"
    >
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
        <div className="mt-1 text-xs text-zinc-500" data-testid="semantic-node-details-subtitle">
          {subtitle}
        </div>
      </header>
      {children}
    </section>
  );
}

function semanticStatus(detail: SemanticNodeDetail) {
  const node = detail.node;
  const statuses: string[] = [];
  if (detail.activity.some((interval) => interval.endedAt === "")) {
    statuses.push("active");
  }
  if (node.dismissed) {
    statuses.push("dismissed");
  }
  if (node.promoted) {
    statuses.push("promoted");
  }
  if (node.splitFromNodeId !== "" || node.splitIntoNodeIds.length > 0) {
    statuses.push("split");
  }
  if (node.mergedIntoNodeId !== "") {
    statuses.push("merged");
  }
  return statuses.length > 0 ? statuses.join(", ") : "active";
}

function latestConfidence(events: SemanticEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const confidence = events[index]?.confidence;
    if (confidence !== null && confidence !== undefined) {
      return `${confidence}`;
    }
  }
  return "";
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

function semanticWhyThisExists(detail: SemanticNodeDetail) {
  const patchSummary = detail.cartographerPatches.find((patch) => patch.patch.publicSummary !== "")
    ?.patch.publicSummary;
  if (patchSummary !== undefined) {
    return patchSummary;
  }
  const evidenceSummary = detail.evidence.find((anchor) => anchor.summary !== "")?.summary;
  return evidenceSummary ?? detail.node.summary;
}

function activityActor(interval: SemanticActivityInterval) {
  if (interval.actorId === "") {
    return interval.actorKind;
  }
  return `${interval.actorKind}:${interval.actorId}`;
}

function cartographerConfidenceText(patch: CartographerPatchRecord) {
  return patch.patch.confidence === null ? "" : `${patch.patch.confidence}`;
}

const cartographerPatchTargetFormatters = {
  attach_evidence: cartographerTargetEntityText,
  create_edge: cartographerEdgeTargetText,
  end_activity: (patch) => patch.payload.activityId,
  mark_resolved: cartographerSemanticNodeTargetText,
  merge_nodes: cartographerMergeTargetText,
  record_constraint: cartographerRecordNodeTargetText,
  record_decision: cartographerRecordNodeTargetText,
  record_finding: cartographerRecordNodeTargetText,
  record_open_question: cartographerRecordNodeTargetText,
  split_node: (patch) => patch.payload.sourceNodeId,
  start_activity: cartographerTargetEntityText,
  update_node_summary: cartographerSemanticNodeTargetText,
} satisfies Record<CartographerPatch["operation"], (patch: CartographerPatch) => string>;

function cartographerPatchTargetText(patch: CartographerPatch) {
  return cartographerPatchTargetFormatters[patch.operation](patch);
}

function cartographerRecordNodeTargetText(patch: CartographerPatch) {
  return patch.payload.newNode?.semanticNodeId ?? patch.payload.semanticNodeId;
}

function cartographerSemanticNodeTargetText(patch: CartographerPatch) {
  return patch.payload.semanticNodeId;
}

function cartographerTargetEntityText(patch: CartographerPatch) {
  return patch.payload.targetEntityId || patch.payload.semanticNodeId;
}

function cartographerEdgeTargetText(patch: CartographerPatch) {
  return `${shortIdentifier(patch.payload.fromNodeId)} -> ${shortIdentifier(patch.payload.toNodeId)}`;
}

function cartographerMergeTargetText(patch: CartographerPatch) {
  return `${shortIdentifierList(patch.payload.sourceNodeIds)} -> ${shortIdentifier(patch.payload.targetNode?.semanticNodeId ?? "")}`;
}

function shortIdentifierList(values: string[]) {
  return values
    .filter((value) => value !== "")
    .map(shortIdentifier)
    .join(", ");
}

function cartographerPatchDiagnostics(patch: CartographerPatchRecord) {
  return [...patch.validationResult.diagnostics, ...patch.applicationResult.diagnostics];
}

function cartographerWindowSummary(window: CartographerWindow) {
  const summaries = [
    window.inputBundle.promptSummary,
    window.inputBundle.assistantResponseSummary,
    window.inputBundle.truncation.deterministicSummary,
    ...window.inputBundle.newEvents.map((event) => event.summary),
  ].filter((summary) => summary !== "");
  return summaries.join("; ");
}

function cartographerWindowCursorText(
  cursor: CartographerWindow["inputBundle"]["windowStartCursor"],
) {
  const parts = [
    cursor.chatEventStreamId === ""
      ? ""
      : `chat ${cursor.chatEventStreamId}:${cursor.chatEventSequence}`,
    cursor.workflowEventCursor === "" ? "" : `workflow ${cursor.workflowEventCursor}`,
    cartographerOutputOrdinalsText(cursor.outputOrdinalByRunItem),
  ].filter((part) => part !== "");
  return parts.join("; ");
}

function cartographerOutputOrdinalsText(ordinals: Record<string, number>) {
  return Object.entries(ordinals)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([runItemId, ordinal]) => `${shortIdentifier(runItemId)}:${ordinal}`)
    .join(", ");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Semantic node detail load failed";
}
