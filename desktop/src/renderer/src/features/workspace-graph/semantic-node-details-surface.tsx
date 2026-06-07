import type {
  SemanticActivityInterval,
  SemanticEdge,
  SemanticEvent,
  SemanticEventHistory,
  SemanticEvidenceAnchor,
  SemanticNodeDetail,
  SemanticSteeringDirective,
} from "@generated/backend";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

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

interface SemanticNodeInspectionState {
  detail: SemanticNodeDetail | null;
  history: SemanticEventHistory | null;
  loadError: string;
  loading: boolean;
}

const semanticEventHistoryLimit = 80;

export function SemanticNodeDetailsSurface() {
  const target = useSemanticGraphStore((state) => state.selectedNodeTarget);
  const inspection = useSemanticNodeInspection(target);
  const title = inspection.detail?.node.label ?? target?.nodeLabel ?? "Semantic Node";
  return (
    <SemanticDetailsShell title={title}>
      <SemanticNodeDetailsContent inspection={inspection} target={target} />
    </SemanticDetailsShell>
  );
}

function useSemanticNodeInspection(target: SemanticNodeDetailsTarget | null) {
  const [state, setState] = useState<SemanticNodeInspectionState>(() => ({
    detail: null,
    history: null,
    loadError: "",
    loading: false,
  }));

  useEffect(() => {
    let disposed = false;
    setState({
      detail: null,
      history: null,
      loadError: "",
      loading: target !== null,
    });
    if (target === null) {
      return;
    }
    const load = async () => {
      const [detailResponse, history] = await Promise.all([
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
      ]);
      if (!disposed) {
        setState({
          detail: detailResponse.detail,
          history,
          loadError: "",
          loading: false,
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
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, [target]);

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
  return <SemanticLoadedNodeDetails detail={inspection.detail} history={inspection.history} />;
}

export function SemanticLoadedNodeDetails({
  detail,
  history,
}: {
  detail: SemanticNodeDetail;
  history: SemanticEventHistory | null;
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
            { label: "Summary", value: node.summary },
          ]}
        />
      </WorkflowDetailsSection>
      <SemanticLineageSection detail={detail} />
      <SemanticEdgeSection incoming={detail.incomingEdges} outgoing={detail.outgoingEdges} />
      <SemanticEvidenceSection evidence={detail.evidence} />
      <SemanticActivitySection activity={detail.activity} />
      <SemanticSteeringSection directives={detail.steeringDirectives} />
      <SemanticContextPackSection contextPacks={detail.contextPackHistory} />
      <SemanticHistorySection history={history} />
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
                { label: "Workflow execution", value: interval.workflowExecutionId },
                { label: "Workflow node", value: interval.workflowNodeId },
                { label: "Chat conversation", value: interval.chatConversationId },
                { label: "Chat run", value: interval.chatRunId },
                { label: "Chat message", value: interval.chatMessageId },
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
                { label: "State", value: directive.active ? "active" : "inactive" },
                { label: "Instruction", value: directive.instruction },
                { label: "Updated", value: directive.updatedAt },
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
                { label: "Summary", value: pack.summary },
                { label: "Items", value: `${pack.itemCount}` },
                { label: "Created", value: pack.createdAt },
                { label: "Prompt", value: pack.prompt },
              ]}
            />
          </SemanticRecord>
        ))}
      </div>
    </WorkflowDetailsSection>
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

function SemanticDetailsShell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100"
      data-testid="semantic-node-details-surface"
    >
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
        <div className="mt-1 text-xs text-zinc-500">Semantic node details</div>
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

function activityActor(interval: SemanticActivityInterval) {
  if (interval.actorId === "") {
    return interval.actorKind;
  }
  return `${interval.actorKind}:${interval.actorId}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Semantic node detail load failed";
}
