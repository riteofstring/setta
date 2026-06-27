import type {
  RunActivityPage,
  RunItem,
  WorkflowActivityRef,
  WorkflowEvent,
  WorkflowExecution,
  WorkflowGraphEdge,
  WorkflowNodeExecution,
  WorkflowToken,
} from "@generated/backend";
import type { ReactNode } from "react";

import type { WorkflowNodeDetailsTarget } from "../../stores/workflow-editor-store";
import {
  latestWorkflowNodeExecution,
  runActivityItemTitle,
  shortIdentifier,
  workflowJsonText,
  workflowNodeEvents,
  workflowNodeKindLabel,
} from "./workflow-node-details-helpers";

export interface WorkflowRunInspectionState {
  activityPages: WorkflowNodeActivityPage[];
  events: WorkflowEvent[];
  execution: WorkflowExecution | null;
  loadError: string;
  loading: boolean;
}

export interface WorkflowNodeActivityPage {
  error: string;
  page: RunActivityPage | null;
  ref: WorkflowActivityRef;
}

export function WorkflowRunDetailsContent({
  inspection,
  target,
}: {
  inspection: WorkflowRunInspectionState;
  target: WorkflowNodeDetailsTarget;
}) {
  if (inspection.loadError !== "") {
    return <WorkflowDetailsError message={inspection.loadError} />;
  }
  if (inspection.loading || inspection.execution === null) {
    return <WorkflowDetailsEmpty message="Loading run details" />;
  }
  const nodeExecution = latestWorkflowNodeExecution(inspection.execution, target.nodeId);
  const nodeEvents = workflowNodeEvents(inspection.events, target.nodeId, nodeExecution?.id ?? "");
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
      data-testid="workflow-node-run-details"
    >
      <WorkflowRunContextSection
        execution={inspection.execution}
        nodeExecution={nodeExecution}
        target={target}
      />
      <WorkflowNodeExecutionSection nodeExecution={nodeExecution} target={target} />
      <WorkflowActionResultSection nodeExecution={nodeExecution} />
      <WorkflowActivitySection activityPages={inspection.activityPages} />
      <WorkflowProjectionFlowSection target={target} />
      <WorkflowTokenFlowSection execution={inspection.execution} nodeId={target.nodeId} />
      <WorkflowEventSection events={nodeEvents} />
    </div>
  );
}

function WorkflowRunContextSection({
  execution,
  nodeExecution,
  target,
}: {
  execution: WorkflowExecution;
  nodeExecution: WorkflowNodeExecution | null;
  target: WorkflowNodeDetailsTarget;
}) {
  return (
    <WorkflowDetailsSection title="Run">
      <WorkflowDetailsRows
        rows={[
          { label: "Run status", value: execution.status },
          { label: "Run", value: shortIdentifier(execution.id) },
          { label: "Version", value: shortIdentifier(execution.definitionVersionId) },
          {
            label: "Node status",
            value: nodeExecution?.status ?? (target.nodeStatus || "not run"),
          },
          {
            label: "Terminal reason",
            value: execution.terminalReason ?? "",
            hidden: !execution.terminalReason,
          },
          { label: "Updated", value: execution.updatedAt },
        ]}
      />
    </WorkflowDetailsSection>
  );
}

function WorkflowNodeExecutionSection({
  nodeExecution,
  target,
}: {
  nodeExecution: WorkflowNodeExecution | null;
  target: WorkflowNodeDetailsTarget;
}) {
  if (nodeExecution === null) {
    return (
      <WorkflowDetailsSection title="Node Execution">
        <WorkflowDetailsEmpty message="This node has not executed in the selected run." />
      </WorkflowDetailsSection>
    );
  }
  return (
    <WorkflowDetailsSection title="Node Execution">
      <WorkflowDetailsRows
        rows={[
          { label: "Node", value: target.nodeLabel },
          { label: "Kind", value: workflowNodeKindLabel(target.nodeKind) },
          { label: "Attempt", value: `${nodeExecution.attempt}` },
          { label: "Iteration", value: `${nodeExecution.iteration}` },
          { label: "Runner", value: nodeExecution.runnerKind ?? nodeExecution.actionKind ?? "" },
          { label: "Scheduled", value: nodeExecution.scheduledAt },
          { label: "Started", value: nodeExecution.startedAt },
          { label: "Completed", value: nodeExecution.completedAt },
          { label: "Idempotency", value: nodeExecution.idempotencyKey },
          { label: "Error", value: nodeExecution.error, hidden: nodeExecution.error === "" },
          {
            label: "Recovery",
            value: [nodeExecution.recoveryOutcome, nodeExecution.recoveryMessage]
              .filter(Boolean)
              .join(": "),
            hidden: nodeExecution.recoveryOutcome === null && nodeExecution.recoveryMessage === "",
          },
        ]}
      />
    </WorkflowDetailsSection>
  );
}

function WorkflowActionResultSection({
  nodeExecution,
}: {
  nodeExecution: WorkflowNodeExecution | null;
}) {
  if (nodeExecution === null || nodeExecution.result === null) {
    return null;
  }
  const result = nodeExecution.result;
  return (
    <WorkflowDetailsSection title="Result">
      <WorkflowDetailsRows
        rows={[
          { label: "Status", value: result.status },
          { label: "Exit code", value: result.exitCode === null ? "" : `${result.exitCode}` },
          { label: "Error", value: result.error, hidden: result.error === "" },
          {
            label: "Approval",
            value: result.pendingApproval?.approval.title ?? "",
            hidden: result.pendingApproval === null,
          },
        ]}
      />
      <WorkflowSignalList signals={result.signals} />
      <WorkflowStringList
        emptyLabel="No file paths reported."
        items={result.filePaths}
        title="Files"
      />
      <WorkflowJsonBlock title="Output" value={result.output} />
    </WorkflowDetailsSection>
  );
}

function WorkflowActivitySection({ activityPages }: { activityPages: WorkflowNodeActivityPage[] }) {
  if (activityPages.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Activity">
      <div className="space-y-3">
        {activityPages.map((activity) => (
          <WorkflowActivityRefDetails activity={activity} key={activity.ref.id} />
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function WorkflowActivityRefDetails({ activity }: { activity: WorkflowNodeActivityPage }) {
  return (
    <div className="space-y-2 rounded-sm border border-zinc-800 bg-zinc-950/60 p-3">
      <WorkflowDetailsRows
        rows={[
          { label: "Kind", value: activity.ref.kind },
          { label: "Ref", value: shortIdentifier(activity.ref.ref) },
          { label: "Cursor", value: activity.ref.endCursor || activity.ref.startCursor },
          { label: "Error", value: activity.error, hidden: activity.error === "" },
        ]}
      />
      {activity.page ? <WorkflowRunActivityPageDetails page={activity.page} /> : null}
    </div>
  );
}

function WorkflowRunActivityPageDetails({ page }: { page: RunActivityPage }) {
  if (page.items.length === 0) {
    return <div className="text-xs text-zinc-500">No activity items recorded.</div>;
  }
  return (
    <div className="space-y-2">
      {page.items.map((item) => (
        <WorkflowRunActivityItem item={item} key={item.id} page={page} />
      ))}
    </div>
  );
}

function WorkflowRunActivityItem({ item, page }: { item: RunItem; page: RunActivityPage }) {
  const output = page.output
    .filter((candidate) => candidate.runItemId === item.id)
    .map((candidate) => candidate.text)
    .join("");
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-zinc-100">
          {runActivityItemTitle(item)}
        </span>
        <span className="shrink-0 text-zinc-500">{item.status}</span>
      </div>
      <WorkflowDetailsRows
        rows={[
          { label: "Type", value: item.type },
          { label: "Tool", value: [item.namespace, item.toolName].filter(Boolean).join("/") },
          { label: "Result", value: item.result },
          { label: "Error", value: item.error, hidden: item.error === "" },
        ]}
      />
      {output !== "" ? (
        <pre className="mt-2 whitespace-pre-wrap text-zinc-300">{output}</pre>
      ) : null}
      <WorkflowJsonBlock title="Details" value={item.details} />
    </div>
  );
}

function WorkflowProjectionFlowSection({ target }: { target: WorkflowNodeDetailsTarget }) {
  if (target.projectionIncomingEdges.length === 0 && target.projectionOutgoingEdges.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Branch State">
      <WorkflowProjectionEdgeList edges={target.projectionIncomingEdges} label="Incoming" />
      <WorkflowProjectionEdgeList edges={target.projectionOutgoingEdges} label="Outgoing" />
    </WorkflowDetailsSection>
  );
}

function WorkflowProjectionEdgeList({
  edges,
  label,
}: {
  edges: WorkflowGraphEdge[];
  label: string;
}) {
  if (edges.length === 0) {
    return <div className="text-xs text-zinc-500">{label}: none</div>;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400">{label}</div>
      {edges.map((edge) => (
        <div
          className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-300"
          key={edge.id}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[11px] text-zinc-500">{edge.id}</span>
            <span className="shrink-0 text-zinc-400">{edge.status}</span>
          </div>
          <div className="mt-1">
            {edge.fromNodeId}
            {" -> "}
            {edge.toNodeId}
          </div>
          <div className="mt-1 text-zinc-400">{edge.label || "always"}</div>
          <div className="mt-1 font-mono text-[11px] text-zinc-500">
            active {edge.activeTokenCount} / completed {edge.completedTokenCount} / cancelled{" "}
            {edge.cancelledTokenCount}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowTokenFlowSection({
  execution,
  nodeId,
}: {
  execution: WorkflowExecution;
  nodeId: string;
}) {
  const incoming = execution.tokens.filter((token) => token.nodeId === nodeId);
  const outgoing = execution.tokens.filter((token) => token.sourceNodeId === nodeId);
  if (incoming.length === 0 && outgoing.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Flow">
      <WorkflowTokenList label="Incoming" tokens={incoming} />
      <WorkflowTokenList label="Outgoing" tokens={outgoing} />
    </WorkflowDetailsSection>
  );
}

function WorkflowTokenList({ label, tokens }: { label: string; tokens: WorkflowToken[] }) {
  if (tokens.length === 0) {
    return <div className="text-xs text-zinc-500">{label}: none</div>;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400">{label}</div>
      {tokens.map((token) => (
        <div
          className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-[11px] text-zinc-300"
          key={token.id}
        >
          {token.edgeId}
          {" -> "}
          {token.status}
        </div>
      ))}
    </div>
  );
}

function WorkflowEventSection({ events }: { events: WorkflowEvent[] }) {
  if (events.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Events">
      <div className="space-y-1">
        {events.map((event) => (
          <div
            className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-300"
            key={event.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-zinc-100">{event.type}</span>
              <span className="shrink-0 font-mono text-[11px] text-zinc-500">#{event.ordinal}</span>
            </div>
            {event.message !== "" ? (
              <div className="mt-1 text-zinc-400">{event.message}</div>
            ) : null}
          </div>
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

export function WorkflowDetailsSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

export function WorkflowDetailsRows({
  rows,
}: {
  rows: { hidden?: boolean; label: string; value: ReactNode }[];
}) {
  const visibleRows = rows.filter((row) => !row.hidden && row.value !== "");
  if (visibleRows.length === 0) {
    return null;
  }
  return (
    <dl className="space-y-1 text-xs">
      {visibleRows.map((row) => (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2" key={row.label}>
          <dt className="text-zinc-500">{row.label}</dt>
          <dd className="min-w-0 break-words text-zinc-300">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function WorkflowSignalList({ signals }: { signals: { name: string; value: string }[] }) {
  if (signals.length === 0) {
    return <div className="text-xs text-zinc-500">No signals emitted.</div>;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400">Signals</div>
      {signals.map((signal) => (
        <div
          className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-[11px] text-zinc-300"
          key={`${signal.name}:${signal.value}`}
        >
          {signal.name}={signal.value}
        </div>
      ))}
    </div>
  );
}

function WorkflowStringList({
  emptyLabel,
  items,
  title,
}: {
  emptyLabel: string;
  items: string[];
  title: string;
}) {
  if (items.length === 0) {
    return <div className="text-xs text-zinc-500">{emptyLabel}</div>;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400">{title}</div>
      {items.map((item) => (
        <div
          className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-[11px] text-zinc-300"
          key={item}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

function WorkflowJsonBlock({ title, value }: { title: string; value: unknown }) {
  const text = workflowJsonText(value);
  if (text === "") {
    return null;
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400">{title}</div>
      <pre className="max-h-48 overflow-auto rounded-sm border border-zinc-800 bg-zinc-950/80 p-2 text-[11px] leading-4 text-zinc-300">
        {text}
      </pre>
    </div>
  );
}

export function WorkflowDetailsEmpty({ message }: { message: string }) {
  return <div className="p-4 text-sm text-zinc-400">{message}</div>;
}

export function WorkflowDetailsError({ message }: { message: string }) {
  return (
    <div
      className="m-4 rounded-sm border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100"
      role="alert"
    >
      {message}
    </div>
  );
}
