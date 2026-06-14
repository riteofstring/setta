import type { MutableRefObject } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type {
  CartographerProcessingQueueItem,
  CartographerProcessingState,
  CartographerRun,
  SemanticCartographerSettingsRecord,
  WorkflowGraphProjection,
  WorkflowValidationResult,
} from "@generated/backend";

import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import {
  WorkflowGraphToolbar,
  WorkflowValidationPanel,
  workflowNodeMenuItems,
} from "./workflow-graph-toolbar";
import type { WorkflowDraftNodeType } from "./workflow-graph-draft";
import { shortIdentifier } from "./workflow-node-details-helpers";
import {
  createCartographerAuditRecordingSnapshot,
  emitCartographerAuditRecordingSnapshot,
  formatCartographerBytes,
  formatCartographerDuration,
  shortCartographerHash,
  summarizeCartographerFinalSynthesisBudget,
} from "../../lib/semantic-cartographer-recording";

export interface WorkflowContextMenuState {
  clientX: number;
  clientY: number;
  worldX: number;
  worldY: number;
}

export interface CartographerHealthData {
  processingState: CartographerProcessingState;
  recentRuns: CartographerRun[];
  settings: SemanticCartographerSettingsRecord;
}

export function WorkflowGraphToolbarLayer({
  addWorkflowDraftNodeFromToolbar,
  debugEnabled,
  openGraphNodeDetails,
  openWorkflowSettings,
  runWorkflowDraft,
  selectedGraphNodeId,
  selectedGraphNodeLabel,
  showDraftWorkflow,
  syntheticGraph,
  validateWorkflowDraft,
  workflowOperation,
  workflowProjection,
  workflowProjectionReady,
  workflowValidation,
  workflowWorkspaceId,
}: {
  addWorkflowDraftNodeFromToolbar: (nodeType: WorkflowDraftNodeType) => Promise<void>;
  debugEnabled: boolean;
  openGraphNodeDetails: (nodeId: string | null) => void;
  openWorkflowSettings: () => void;
  runWorkflowDraft: () => Promise<void>;
  selectedGraphNodeId: string | null;
  selectedGraphNodeLabel: string;
  showDraftWorkflow: () => Promise<void>;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  validateWorkflowDraft: () => Promise<WorkflowValidationResult | null>;
  workflowOperation: "run" | "validate" | null;
  workflowProjection: WorkflowGraphProjection | null;
  workflowProjectionReady: boolean;
  workflowValidation: WorkflowValidationResult | null;
  workflowWorkspaceId: string;
}) {
  if (syntheticGraph !== null) {
    return null;
  }
  return (
    <>
      <div className="pointer-events-none absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col gap-2">
        <WorkflowGraphToolbar
          busy={workflowOperation}
          onAddNode={(nodeType) => void addWorkflowDraftNodeFromToolbar(nodeType)}
          onOpenDetails={() => openGraphNodeDetails(selectedGraphNodeId)}
          onOpenSettings={() => openWorkflowSettings()}
          onRun={() => void runWorkflowDraft()}
          onShowDraft={() => void showDraftWorkflow()}
          onValidate={() => void validateWorkflowDraft()}
          projection={workflowProjection}
          ready={workflowProjectionReady}
          selectedNodeLabel={selectedGraphNodeLabel}
          validation={workflowValidation}
          workspaceId={workflowWorkspaceId}
        />
        <WorkflowValidationLayer workflowValidation={workflowValidation} />
      </div>
      <CartographerHealthLayer debugEnabled={debugEnabled} workspaceId={workflowWorkspaceId} />
    </>
  );
}

export function WorkflowGraphStateLayers({
  loadingProjection,
  noWorkspace,
  semanticEmpty,
  workflowProjectionError,
}: {
  loadingProjection: boolean;
  noWorkspace: boolean;
  semanticEmpty: boolean;
  workflowProjectionError: string;
}) {
  return workflowGraphStateLabels({
    loadingProjection,
    noWorkspace,
    semanticEmpty,
    workflowProjectionError,
  }).map((label) => <WorkflowGraphState key={label} label={label} />);
}

function WorkflowValidationLayer({
  workflowValidation,
}: {
  workflowValidation: WorkflowValidationResult | null;
}) {
  if (!workflowValidation) {
    return null;
  }
  return <WorkflowValidationPanel validation={workflowValidation} />;
}

function CartographerHealthLayer({
  debugEnabled,
  workspaceId,
}: {
  debugEnabled: boolean;
  workspaceId: string;
}) {
  const health = useCartographerProcessingState(debugEnabled, workspaceId);
  if (!debugEnabled || workspaceId === "") {
    return null;
  }
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 z-20 max-h-[40%] max-w-xl overflow-auto rounded-md border border-zinc-700/80 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-100 shadow-xl shadow-zinc-950/40 backdrop-blur"
      data-testid="cartographer-health-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-zinc-100">Cartographer Health</div>
        <button
          className="pointer-events-auto rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="cartographer-health-refresh"
          disabled={health.loading}
          onClick={health.reload}
          type="button"
        >
          {health.loading ? "Refreshing" : "Refresh"}
        </button>
      </div>
      {health.error !== "" ? <div className="mt-2 text-rose-300">{health.error}</div> : null}
      {health.data === null ? (
        <div className="mt-2 text-zinc-500">Waiting for cartographer audit state</div>
      ) : (
        <CartographerHealthState data={health.data} />
      )}
    </div>
  );
}

function useCartographerProcessingState(debugEnabled: boolean, workspaceId: string) {
  const [data, setData] = useState<CartographerHealthData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshRequest, setRefreshRequest] = useState<{
    serial: number;
    workspaceId: string;
  } | null>(null);

  useEffect(() => {
    if (!debugEnabled || workspaceId === "") {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    setData(null);
    setError("");
    setLoading(false);
    setRefreshRequest({ serial: 0, workspaceId });
  }, [debugEnabled, workspaceId]);

  useEffect(() => {
    if (
      !debugEnabled ||
      workspaceId === "" ||
      refreshRequest === null ||
      refreshRequest.workspaceId !== workspaceId
    ) {
      return;
    }
    let disposed = false;
    const load = async () => {
      setLoading(true);
      try {
        const [settings, nextState, recentRuns] = await Promise.all([
          window.setta.semanticGraph.readCartographerSettings({}),
          window.setta.semanticGraph.readCartographerProcessingState({}),
          window.setta.semanticGraph
            .listCartographerRuns({
              chatRunId: "",
              limit: 12,
              targetEntityId: "",
              workflowExecutionId: "",
              workspaceId,
            })
            .then((list) => list.runs),
        ]);
        if (!disposed) {
          const nextData = {
            processingState: nextState,
            recentRuns,
            settings,
          };
          emitCartographerAuditRecordingSnapshot(
            createCartographerAuditRecordingSnapshot({
              capturedAt: new Date().toISOString(),
              processingState: nextState,
              recentRuns,
              settings,
              trigger:
                refreshRequest.serial === 0
                  ? "workflow_graph_debug_open"
                  : "workflow_graph_debug_refresh",
              workspaceId,
            }),
          );
          setData(nextData);
          setError("");
        }
      } catch (error: unknown) {
        if (!disposed) {
          setError(errorMessage(error));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [debugEnabled, refreshRequest, workspaceId]);

  return {
    error,
    loading,
    reload: () =>
      setRefreshRequest((request) => ({
        serial: (request?.serial ?? 0) + 1,
        workspaceId,
      })),
    data,
  };
}

export function CartographerHealthState({ data }: { data: CartographerHealthData }) {
  const state = data.processingState;
  return (
    <div className="mt-2 space-y-2">
      <CartographerHealthRows
        rows={[
          { label: "Settings", value: shortCartographerHash(data.settings.settingsHash) },
          { label: "Runtime", value: cartographerRuntimeText(state) },
          { label: "Queue", value: cartographerQueueText(state) },
          { label: "Durable", value: cartographerDurableText(state) },
          { label: "Review", value: `${state.pendingReviewPatchCount} pending patch(es)` },
          { label: "Superseded", value: `${state.supersededWindowCount}` },
          { label: "No-op", value: cartographerNoopText(state) },
          { label: "Failed", value: cartographerFailureText(state) },
          { label: "Last processed", value: cartographerProcessedText(state) },
          { label: "Last applied", value: cartographerAppliedText(state) },
          { label: "Created events", value: shortIdentifierList(state.createdSemanticEventIds) },
          { label: "Guidance", value: state.concurrencyGuidance },
        ]}
      />
      <CartographerFinalSynthesisBudgets runs={data.recentRuns} />
      <CartographerQueueItems title="Queued Windows" items={state.queuedWindows} />
      <CartographerQueueItems title="Running Windows" items={state.runningWindows} />
    </div>
  );
}

function CartographerFinalSynthesisBudgets({ runs }: { runs: CartographerRun[] }) {
  const summaries = runs
    .filter((run) => run.triggerKind === "workflow_done")
    .slice(0, 3)
    .map((run) => summarizeCartographerFinalSynthesisBudget(run));
  if (summaries.length === 0) {
    return null;
  }
  return (
    <div className="border-t border-zinc-800 pt-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Final Synthesis Budget
      </div>
      <div className="mt-1 space-y-1">
        {summaries.map((summary) => (
          <div
            className="rounded-sm border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-300"
            key={summary.runId}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium text-zinc-200">
                {budgetOutcomeText(summary.outcome)}
              </span>
              <span>{summary.status}</span>
              <span>run {shortIdentifier(summary.runId)}</span>
            </div>
            <div className="mt-0.5 break-words text-zinc-500">
              {summary.model.display} / {summary.reasoning.display}; chars{" "}
              {formatInteger(summary.serializedInputCharacterCount)}/
              {formatInteger(summary.requestedInputBudget)}; harness{" "}
              {formatCartographerDuration(summary.harnessDurationMs)}; total{" "}
              {formatCartographerDuration(summary.totalDurationMs)}
            </div>
            <div className="mt-0.5 break-words text-zinc-500">
              {formatCartographerBytes(summary.serializedInputBytes)}, included{" "}
              {formatInteger(summary.includedItemCount)}, dropped{" "}
              {formatInteger(summary.droppedItemCount)}, folded windows{" "}
              {formatInteger(summary.truncation.foldedWindowCount)}
            </div>
            {summary.truncation.deterministicSummary !== "" ? (
              <div className="mt-0.5 break-words text-zinc-500">
                {summary.truncation.deterministicSummary}
              </div>
            ) : null}
            {summary.error !== "" ? (
              <div className="mt-0.5 break-words text-rose-300">{summary.error}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CartographerHealthRows({ rows }: { rows: { label: string; value: string }[] }) {
  const visibleRows = rows.filter((row) => row.value !== "");
  return (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1">
      {visibleRows.map((row) => (
        <div className="contents" key={row.label}>
          <dt className="text-zinc-500">{row.label}</dt>
          <dd className="min-w-0 break-words text-zinc-300">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CartographerQueueItems({
  items,
  title,
}: {
  items: CartographerProcessingQueueItem[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="border-t border-zinc-800 pt-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-1 space-y-1">
        {items.slice(0, 3).map((item) => (
          <div
            className="rounded-sm border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-300"
            key={item.windowId}
          >
            {item.position}. {item.status} {item.triggerKind} window{" "}
            {shortIdentifier(item.windowId)} run {shortIdentifier(item.runId)}
          </div>
        ))}
        {items.length > 3 ? (
          <div className="text-[11px] text-zinc-500">{items.length - 3} more</div>
        ) : null}
      </div>
    </div>
  );
}

function cartographerRuntimeText(state: CartographerProcessingState) {
  return `${state.enabled ? "enabled" : "disabled"}, ${state.started ? "started" : "stopped"}, max ${state.maxConcurrent}, per-source ${state.perSourceConcurrent}`;
}

function cartographerQueueText(state: CartographerProcessingState) {
  return `${state.queuedWindowCount} queued, ${state.runningWindowCount} running`;
}

function cartographerDurableText(state: CartographerProcessingState) {
  return `${state.durableQueuedWindowCount} queued, ${state.durableRunningWindowCount} running, ${state.staleLeaseCount} stale lease(s)`;
}

function cartographerNoopText(state: CartographerProcessingState) {
  const parts = [`${state.completedNoopRunCount}`];
  if (state.lastNoopRunId !== "") {
    parts.push(`last ${shortIdentifier(state.lastNoopRunId)}`);
  }
  if (state.lastNoopReason !== "") {
    parts.push(state.lastNoopReason);
  }
  return parts.join(", ");
}

function cartographerFailureText(state: CartographerProcessingState) {
  const parts = [`${state.failedRunCount}`];
  if (state.lastFailure !== null) {
    parts.push(`last ${shortIdentifier(state.lastFailure.runId)}: ${state.lastFailure.message}`);
  }
  return parts.join(", ");
}

function cartographerProcessedText(state: CartographerProcessingState) {
  if (state.lastProcessedWindowId === "" && state.lastProcessedRunId === "") {
    return "";
  }
  return [
    state.lastProcessedWindowId === ""
      ? ""
      : `window ${shortIdentifier(state.lastProcessedWindowId)}`,
    state.lastProcessedRunId === "" ? "" : `run ${shortIdentifier(state.lastProcessedRunId)}`,
    state.lastProcessedAt,
  ]
    .filter(Boolean)
    .join(", ");
}

function cartographerAppliedText(state: CartographerProcessingState) {
  if (state.lastAppliedPatchId === "") {
    return "";
  }
  return [shortIdentifier(state.lastAppliedPatchId), state.lastAppliedAt]
    .filter(Boolean)
    .join(", ");
}

function shortIdentifierList(values: string[]) {
  return values
    .filter((value) => value !== "")
    .map(shortIdentifier)
    .join(", ");
}

function budgetOutcomeText(
  outcome: ReturnType<typeof summarizeCartographerFinalSynthesisBudget>["outcome"],
) {
  switch (outcome) {
    case "within_budget":
      return "within budget";
    case "compacted_to_fit":
      return "compacted to fit";
    case "input_budget_exceeded":
      return "input budget exceeded";
    case "not_measured":
      return "not measured";
  }
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function WorkflowContextMenuLayer({
  addWorkflowDraftNode,
  workflowContextMenu,
  workflowMenuRef,
}: {
  addWorkflowDraftNode: (nodeType: WorkflowDraftNodeType) => Promise<void>;
  workflowContextMenu: WorkflowContextMenuState | null;
  workflowMenuRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (!workflowContextMenu) {
    return null;
  }
  return (
    <WorkflowCanvasContextMenu
      menu={workflowContextMenu}
      menuRef={workflowMenuRef}
      onSelectNodeType={(nodeType) => void addWorkflowDraftNode(nodeType)}
    />
  );
}

export function WorkflowGraphEditorErrorLayer({ message }: { message: string }) {
  if (!message) {
    return null;
  }
  return <WorkflowGraphEditorError message={message} />;
}

function workflowGraphStateLabels({
  loadingProjection,
  noWorkspace,
  semanticEmpty,
  workflowProjectionError,
}: {
  loadingProjection: boolean;
  noWorkspace: boolean;
  semanticEmpty: boolean;
  workflowProjectionError: string;
}) {
  const labels: string[] = [];
  if (loadingProjection) {
    labels.push("Loading workflow graph");
  }
  if (noWorkspace) {
    labels.push("Open a workspace to edit workflows");
  }
  if (semanticEmpty) {
    labels.push("Semantic graph empty");
  }
  if (workflowProjectionError) {
    labels.push(workflowProjectionError);
  }
  return labels;
}

function WorkflowGraphState({ label }: { label: string }) {
  return <div className="workspace-workflow-graph-state">{label}</div>;
}

function WorkflowGraphEditorError({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
      <div className="pointer-events-auto max-w-md rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 shadow-lg">
        {message}
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Cartographer processing state load failed";
}

function WorkflowCanvasContextMenu({
  menu,
  menuRef,
  onSelectNodeType,
}: {
  menu: WorkflowContextMenuState;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  onSelectNodeType: (nodeType: WorkflowDraftNodeType) => void;
}) {
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 w-48 rounded-sm border border-zinc-700/80 bg-zinc-900/95 p-1 text-zinc-100 shadow-2xl shadow-zinc-950/50 backdrop-blur"
      data-testid="workflow-node-create-menu"
      role="menu"
      style={{ left: menu.clientX, top: menu.clientY }}
    >
      {workflowNodeMenuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50"
            data-testid={`workflow-node-create-${item.type}`}
            onClick={() => onSelectNodeType(item.type)}
            role="menuitem"
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
