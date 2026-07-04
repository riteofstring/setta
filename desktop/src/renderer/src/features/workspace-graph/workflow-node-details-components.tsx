import type {
  WorkflowEvent,
  WorkflowExecution,
  WorkflowGraphEdge,
  WorkflowNodeExecution,
  WorkflowPendingApproval,
  WorkflowToken,
} from "@generated/backend";
import { useEffect, useRef, type ReactNode } from "react";

import { AgentTrajectorySurface } from "../../components/agent-trajectory";
import { Composer } from "../../components/chat-composer";
import type { LoadRunItemOutput } from "../../components/chat-transcript-activity";
import type { SubmitApproval } from "../../components/chat-transcript-approvals";
import { cn } from "../../lib/utils";
import type {
  WorkflowNodeActivityFocus,
  WorkflowNodeDetailsTarget,
} from "../../stores/workflow-editor-store";
import {
  workflowActivityFocusApprovalId,
  workflowActivityFocusElementId,
  workflowActivityFocusWorkflowEventId,
} from "./workflow-node-activity-focus";
import {
  workflowNodeTrajectoryActions,
  workflowNodeComposerActions,
  workflowNodeComposerRunPresentation,
  workflowNodeComposerViewModel,
  workflowNodeTrajectoryViewModel,
  type WorkflowNodeTrajectoryState,
} from "./workflow-node-agent-trajectory-adapter";
import {
  latestWorkflowNodeExecution,
  shortIdentifier,
  workflowJsonText,
  workflowNodeEvents,
  workflowNodeKindLabel,
} from "./workflow-node-details-helpers";
import type { ComposerActions } from "../../components/chat-composer-contract";

export interface WorkflowRunInspectionState {
  events: WorkflowEvent[];
  execution: WorkflowExecution | null;
  loadError: string;
  loading: boolean;
  operation: string | null;
  trajectory: WorkflowNodeTrajectoryState | null;
  trajectoryError: string;
}

export interface WorkflowRunTrajectoryActions {
  loadOlder: () => Promise<void>;
  loadRunItemOutput: LoadRunItemOutput;
  retryLiveness: () => Promise<void>;
  steerMessage: NonNullable<ComposerActions["steerMessage"]>;
  stopRun: () => Promise<void>;
  submitApproval: SubmitApproval;
}

export function WorkflowRunDetailsContent({
  actions,
  focus,
  inspection,
  target,
}: {
  actions: WorkflowRunTrajectoryActions;
  focus: WorkflowNodeActivityFocus | null;
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
      <WorkflowActionResultSection focus={focus} nodeExecution={nodeExecution} />
      <WorkflowAgentTrajectorySection actions={actions} focus={focus} inspection={inspection} />
      <WorkflowProjectionFlowSection target={target} />
      <WorkflowTokenFlowSection execution={inspection.execution} nodeId={target.nodeId} />
      <WorkflowEventSection events={nodeEvents} focus={focus} />
    </div>
  );
}

// Scrolls a deep-linked detail row into view when an activity chip targets it. requestId in the
// focus ensures re-clicking the same chip re-runs the effect.
function useWorkflowActivityFocusScroll<T extends HTMLElement>(
  focused: boolean,
  requestId: number,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (focused) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [focused, requestId]);
  return ref;
}

function workflowActivityRowFocused(focus: WorkflowNodeActivityFocus | null, elementId: string) {
  return focus !== null && elementId !== "" && workflowActivityFocusElementId(focus) === elementId;
}

// A bordered detail row that highlights and scrolls into view when an activity chip deep-links to
// its elementId. Shared by the pending-approval and workflow-event rows so the focus treatment lives
// in one place.
function WorkflowFocusableDetailRow({
  children,
  elementId,
  focus,
}: {
  children: ReactNode;
  elementId: string;
  focus: WorkflowNodeActivityFocus | null;
}) {
  const focused = workflowActivityRowFocused(focus, elementId);
  const ref = useWorkflowActivityFocusScroll<HTMLDivElement>(focused, focus?.requestId ?? 0);
  return (
    <div
      className={cn(
        "rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-300",
        focused && "ring-2 ring-accent-violet/70 ring-offset-1 ring-offset-background",
      )}
      data-activity-focus-id={focused ? elementId : undefined}
      data-activity-focused={focused ? "true" : undefined}
      ref={ref}
    >
      {children}
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
  focus,
  nodeExecution,
}: {
  focus: WorkflowNodeActivityFocus | null;
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
        ]}
      />
      <WorkflowPendingApprovalRow focus={focus} pendingApproval={result.pendingApproval} />
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

function WorkflowPendingApprovalRow({
  focus,
  pendingApproval,
}: {
  focus: WorkflowNodeActivityFocus | null;
  pendingApproval: WorkflowPendingApproval | null;
}) {
  if (pendingApproval === null) {
    return null;
  }
  const approval = pendingApproval.approval;
  const detail = approval.command || approval.filePath || approval.permission;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-400">Approval</div>
      <WorkflowFocusableDetailRow
        elementId={workflowActivityFocusApprovalId(pendingApproval.approvalId)}
        focus={focus}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-medium text-zinc-100">
            {approval.title || "Approval"}
          </span>
          <span className="shrink-0 text-zinc-500">{approval.status}</span>
        </div>
        {detail !== "" ? <div className="mt-1 truncate text-zinc-400">{detail}</div> : null}
      </WorkflowFocusableDetailRow>
    </div>
  );
}

function WorkflowAgentTrajectorySection({
  actions,
  focus,
  inspection,
}: {
  actions: WorkflowRunTrajectoryActions;
  focus: WorkflowNodeActivityFocus | null;
  inspection: WorkflowRunInspectionState;
}) {
  if (inspection.trajectoryError !== "") {
    return (
      <WorkflowDetailsSection title="Agent Trajectory">
        <WorkflowDetailsError message={inspection.trajectoryError} />
      </WorkflowDetailsSection>
    );
  }
  if (inspection.trajectory === null) {
    return null;
  }
  const focusedSourceRunItemId =
    focus?.detailKind === "chat_run_item" && focus.runItemId !== "" ? focus.runItemId : undefined;
  const trajectoryActions = workflowNodeTrajectoryActions({
    loadOlder: actions.loadOlder,
    loadRunItemOutput: actions.loadRunItemOutput,
    retryLiveness: actions.retryLiveness,
    state: inspection.trajectory,
    stopRun: actions.stopRun,
    submitApproval: actions.submitApproval,
  });
  const viewModel = workflowNodeTrajectoryViewModel({
    focusedSourceRunItemId: focusedSourceRunItemId ?? null,
    operation: inspection.operation,
    state: inspection.trajectory,
  });
  const runPresentation = workflowNodeComposerRunPresentation(inspection.trajectory);
  const composerViewModel = workflowNodeComposerViewModel({
    operation: inspection.operation,
    state: inspection.trajectory,
  });
  const composerActions = workflowNodeComposerActions({
    retryLiveness: actions.retryLiveness,
    state: inspection.trajectory,
    steerMessage: actions.steerMessage,
    stopRun: actions.stopRun,
  });
  const showComposer = composerViewModel.session !== null;
  return (
    <WorkflowDetailsSection title="Agent Trajectory">
      <div
        className="flex h-[36rem] min-h-80 flex-col overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950/60"
        data-testid="workflow-node-agent-trajectory"
      >
        <div className="min-h-0 flex-1">
          <AgentTrajectorySurface actions={trajectoryActions} viewModel={viewModel} />
        </div>
        {showComposer ? (
          <Composer
            actions={composerActions}
            busy={inspection.operation !== null}
            disabled={!runPresentation.canSteer}
            frameClassName="border-zinc-800 bg-zinc-950/80 shadow-none"
            placeholder={
              runPresentation.canSteer ? "" : "Steering is not available for this workflow node."
            }
            running={runPresentation.running}
            runPresentation={runPresentation}
            viewModel={composerViewModel}
          />
        ) : null}
      </div>
    </WorkflowDetailsSection>
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

function WorkflowEventSection({
  events,
  focus,
}: {
  events: WorkflowEvent[];
  focus: WorkflowNodeActivityFocus | null;
}) {
  if (events.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Events">
      <div className="space-y-1">
        {events.map((event) => (
          <WorkflowEventRow event={event} focus={focus} key={event.id} />
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function WorkflowEventRow({
  event,
  focus,
}: {
  event: WorkflowEvent;
  focus: WorkflowNodeActivityFocus | null;
}) {
  return (
    <WorkflowFocusableDetailRow
      elementId={workflowActivityFocusWorkflowEventId(event.id)}
      focus={focus}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-zinc-100">{event.type}</span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">#{event.ordinal}</span>
      </div>
      {event.message !== "" ? <div className="mt-1 text-zinc-400">{event.message}</div> : null}
    </WorkflowFocusableDetailRow>
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
