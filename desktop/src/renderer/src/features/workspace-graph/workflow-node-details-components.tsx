import type {
  WorkflowEvent,
  WorkflowExecution,
  WorkflowGraphEdge,
  WorkflowAgentEffectiveRunSettings,
  WorkflowAgentSettingsSource,
  WorkflowNodeExecution,
  WorkflowPendingApproval,
  WorkflowToken,
} from "@generated/backend";
import { RefreshCcw, Square } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AgentTrajectorySurface } from "../../components/agent-trajectory";
import { Composer } from "../../components/chat-composer";
import type { LoadRunItemOutput } from "../../components/chat-transcript-activity";
import type { SubmitApproval } from "../../components/chat-transcript-approvals";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
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
  shortIdentifier,
  workflowJsonText,
  workflowNodeExecutionForDetailsTarget,
  workflowNodeEvents,
  workflowNodeKindLabel,
} from "./workflow-node-details-helpers";
import type { ComposerActions } from "../../components/chat-composer-contract";

export interface WorkflowRunInspectionState {
  events: WorkflowEvent[];
  execution: WorkflowExecution | null;
  lastWorkflowEventOrdinal: number;
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
  const nodeExecution = workflowNodeExecutionForDetailsTarget(inspection.execution, target);
  const nodeEvents = workflowNodeEvents(inspection.events, target.nodeId, nodeExecution?.id ?? "");
  const header = (
    <WorkflowRunHeader
      actions={actions}
      execution={inspection.execution}
      inspection={inspection}
      nodeExecution={nodeExecution}
      target={target}
    />
  );
  if (inspection.trajectory !== null || inspection.trajectoryError !== "") {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="workflow-node-run-details"
        data-workflow-node-run-layout="agent"
      >
        {header}
        <WorkflowRunDetailsDock
          events={nodeEvents}
          execution={inspection.execution}
          focus={focus}
          nodeExecution={nodeExecution}
          target={target}
        />
        <WorkflowAgentTrajectoryPane actions={actions} focus={focus} inspection={inspection} />
      </div>
    );
  }
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="workflow-node-run-details"
      data-workflow-node-run-layout="details"
    >
      {header}
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <WorkflowRunContextSection
          execution={inspection.execution}
          nodeExecution={nodeExecution}
          target={target}
        />
        <WorkflowNodeExecutionSection nodeExecution={nodeExecution} target={target} />
        <WorkflowActionResultSection focus={focus} nodeExecution={nodeExecution} />
        <WorkflowProjectionFlowSection target={target} />
        <WorkflowTokenFlowSection execution={inspection.execution} nodeId={target.nodeId} />
        <WorkflowEventSection events={nodeEvents} focus={focus} />
      </div>
    </div>
  );
}

function WorkflowRunHeader({
  actions,
  execution,
  inspection,
  nodeExecution,
  target,
}: {
  actions: WorkflowRunTrajectoryActions;
  execution: WorkflowExecution;
  inspection: WorkflowRunInspectionState;
  nodeExecution: WorkflowNodeExecution | null;
  target: WorkflowNodeDetailsTarget;
}) {
  const model = workflowRunHeaderModel(execution, inspection, nodeExecution, target);
  return (
    <div
      className="border-b border-zinc-800 bg-zinc-950/95 px-4 py-3"
      data-testid="workflow-node-run-header"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 border-l-2 border-accent-violet/70 pl-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-0 truncate text-sm font-semibold text-zinc-100">
              {model.title}
            </div>
            <WorkflowStatusChip label={model.nodeStatus} />
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-500">
            <span data-testid="workflow-node-details-node-id">{target.nodeId}</span>
            <span>run {shortIdentifier(execution.id)}</span>
            <span>version {shortIdentifier(execution.definitionVersionId)}</span>
            <WorkflowRunHeaderExecutionStatus status={model.executionStatus} />
            <WorkflowRunHeaderNodeExecution nodeExecution={nodeExecution} />
          </div>
        </div>
        <WorkflowRunHeaderActions
          actions={actions}
          canRetry={model.canRetry}
          canStop={model.canStop}
          disabled={inspection.operation !== null}
        />
      </div>
    </div>
  );
}

function workflowRunHeaderModel(
  execution: WorkflowExecution,
  inspection: WorkflowRunInspectionState,
  nodeExecution: WorkflowNodeExecution | null,
  target: WorkflowNodeDetailsTarget,
) {
  const capabilities = inspection.trajectory?.page.capabilities;
  const nodeStatus = nodeExecution?.status ?? target.nodeStatus;
  return {
    canRetry: capabilities?.canRetryLiveness === true,
    canStop: capabilities?.canStopRun === true,
    executionStatus: workflowExecutionStatusContext(execution.status, nodeStatus),
    nodeStatus: workflowNodeStatusLabel(nodeStatus),
    title: target.nodeLabel || target.nodeId,
  };
}

function workflowNodeStatusLabel(status: string) {
  switch (status) {
    case "":
    case "not_started":
      return "pending";
    case "succeeded":
      return "completed";
    case "waiting_approval":
      return "waiting approval";
    case "recovery_required":
      return "failed";
    default:
      return status.replaceAll("_", " ");
  }
}

function workflowExecutionStatusContext(executionStatus: string, nodeStatus: string) {
  const nodeEquivalent = workflowExecutionEquivalentNodeStatus(executionStatus);
  if (nodeEquivalent === nodeStatus) {
    return "";
  }
  return `workflow ${executionStatus.replaceAll("_", " ")}`;
}

function workflowExecutionEquivalentNodeStatus(status: string) {
  switch (status) {
    case "completed":
      return "succeeded";
    case "cancelled":
    case "failed":
    case "running":
      return status;
    default:
      return "";
  }
}

function WorkflowRunHeaderExecutionStatus({ status }: { status: string }) {
  if (status === "") {
    return null;
  }
  return <span data-testid="workflow-node-run-workflow-status">{status}</span>;
}

function WorkflowRunHeaderNodeExecution({
  nodeExecution,
}: {
  nodeExecution: WorkflowNodeExecution | null;
}) {
  if (nodeExecution === null) {
    return null;
  }
  return <span>node {shortIdentifier(nodeExecution.id)}</span>;
}

function WorkflowRunHeaderActions({
  actions,
  canRetry,
  canStop,
  disabled,
}: {
  actions: WorkflowRunTrajectoryActions;
  canRetry: boolean;
  canStop: boolean;
  disabled: boolean;
}) {
  if (!canRetry && !canStop) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      {canRetry ? (
        <Button
          aria-label="Retry run liveness"
          className="h-7 w-7 px-0"
          disabled={disabled}
          onClick={() => void actions.retryLiveness()}
          title="Retry run liveness"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {canStop ? (
        <Button
          aria-label="Stop run"
          className="h-7 w-7 px-0"
          disabled={disabled}
          onClick={() => void actions.stopRun()}
          title="Stop run"
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function WorkflowStatusChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex h-5 items-center rounded-sm border border-accent-violet/30 bg-accent-violet/10 px-1.5 text-[11px] font-medium text-violet-200"
      data-testid="workflow-node-status-chip"
    >
      {label}
    </span>
  );
}

function WorkflowRunDetailsDock({
  events,
  execution,
  focus,
  nodeExecution,
  target,
}: {
  events: WorkflowEvent[];
  execution: WorkflowExecution;
  focus: WorkflowNodeActivityFocus | null;
  nodeExecution: WorkflowNodeExecution | null;
  target: WorkflowNodeDetailsTarget;
}) {
  const defaultOpen = workflowDetailsDockDefaultOpen(focus);
  const targetKey = workflowDetailsDockTargetKey(target);
  const previousTargetKey = useRef(targetKey);
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (previousTargetKey.current !== targetKey) {
      previousTargetKey.current = targetKey;
      setOpen(defaultOpen);
      return;
    }
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen, focus?.requestId, targetKey]);
  return (
    <details
      className="border-b border-zinc-800 bg-zinc-950/80"
      data-default-open={defaultOpen ? "true" : undefined}
      data-testid="workflow-run-details-dock"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-xs font-medium text-zinc-300 marker:hidden">
        <span>Workflow run details</span>
        <span className="font-mono text-[11px] text-zinc-500">{open ? "hide" : "show"}</span>
      </summary>
      <div className="grid gap-4 border-t border-zinc-800 px-4 py-3 lg:grid-cols-2">
        <WorkflowRunContextSection
          execution={execution}
          nodeExecution={nodeExecution}
          target={target}
        />
        <WorkflowNodeExecutionSection nodeExecution={nodeExecution} target={target} />
        <WorkflowActionResultSection focus={focus} nodeExecution={nodeExecution} />
        <WorkflowProjectionFlowSection target={target} />
        <WorkflowTokenFlowSection execution={execution} nodeId={target.nodeId} />
        <WorkflowEventSection events={events} focus={focus} />
      </div>
    </details>
  );
}

function workflowDetailsDockTargetKey(target: WorkflowNodeDetailsTarget) {
  return [
    target.workspaceId,
    target.definitionId,
    target.definitionVersionId,
    target.executionId,
    target.nodeId,
    target.nodeExecutionId,
  ].join(":");
}

function workflowDetailsDockDefaultOpen(focus: WorkflowNodeActivityFocus | null) {
  return (
    focus !== null &&
    (focus.detailKind === "approval" ||
      focus.detailKind === "workflow_event" ||
      focus.detailKind === "workflow_node")
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

function WorkflowAgentTrajectoryPane({
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
      <div className="min-h-0 flex-1 overflow-hidden" data-testid="workflow-node-agent-trajectory">
        <WorkflowDetailsError message={inspection.trajectoryError} />
      </div>
    );
  }
  if (inspection.trajectory === null) {
    return (
      <div className="min-h-0 flex-1 overflow-hidden" data-testid="workflow-node-agent-trajectory">
        <WorkflowDetailsEmpty message="Agent trajectory is not available for this workflow node." />
      </div>
    );
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
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-workflow-node-execution-id={inspection.trajectory.page.scope.nodeExecutionId}
      data-workflow-node-run-id={inspection.trajectory.page.runId}
      data-testid="workflow-node-agent-trajectory"
    >
      <div className="min-h-0 flex-1">
        <AgentTrajectorySurface actions={trajectoryActions} viewModel={viewModel} />
      </div>
      <WorkflowAgentRunSettingsBar settings={inspection.trajectory.page.runSettings} />
      {showComposer ? (
        <Composer
          actions={composerActions}
          busy={inspection.operation !== null}
          disabled={!runPresentation.canSteer}
          frameClassName="border-zinc-800 bg-zinc-950/90 shadow-none"
          placeholder={
            runPresentation.canSteer ? "" : "Steering is not available for this workflow node."
          }
          running={runPresentation.running}
          runPresentation={runPresentation}
          viewModel={composerViewModel}
        />
      ) : null}
    </div>
  );
}

function WorkflowAgentRunSettingsBar({
  settings,
}: {
  settings: WorkflowAgentEffectiveRunSettings | null;
}) {
  if (settings === null) {
    return null;
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-zinc-800 bg-zinc-950/90 px-4 py-2"
      data-testid="workflow-agent-run-settings"
    >
      <WorkflowRunSettingPill
        label="Permission"
        value={`${settings.permissionDisplayLabel} - ${workflowAgentSettingsSourceLabel(
          settings.permissionSource,
        )}`}
      />
      <WorkflowRunSettingPill
        label="Model"
        value={`${settings.modelDisplayName} - ${workflowAgentSettingsSourceLabel(
          settings.modelSource,
        )}`}
      />
      <WorkflowRunSettingPill
        label="Reasoning"
        value={`${settings.reasoningEffortDisplayName} - ${workflowAgentSettingsSourceLabel(
          settings.reasoningEffortSource,
        )}`}
      />
    </div>
  );
}

function WorkflowRunSettingPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-sm border border-zinc-800 bg-zinc-900/70 px-2 text-xs text-zinc-300">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="min-w-0 truncate text-zinc-200">{value}</span>
    </div>
  );
}

function workflowAgentSettingsSourceLabel(source: WorkflowAgentSettingsSource) {
  switch (source) {
    case "node":
      return "node override";
    case "workflow":
      return "workflow default";
    case "default":
      return "app default";
    default:
      return source satisfies never;
  }
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
