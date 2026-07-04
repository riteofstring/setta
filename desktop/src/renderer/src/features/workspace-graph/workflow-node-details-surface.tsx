import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@generated/backend";
import { RefreshCcw, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkflowDefinitionStore } from "../../stores/workflow-definition-store";
import {
  useWorkflowEditorStore,
  type WorkflowNodeActivityFocus,
} from "../../stores/workflow-editor-store";
import {
  WorkflowDetailsEmpty,
  WorkflowDetailsError,
  WorkflowDetailsRows,
  WorkflowDetailsSection,
  WorkflowRunDetailsContent,
  type WorkflowRunInspectionState,
  type WorkflowRunTrajectoryActions,
} from "./workflow-node-details-components";
import {
  workflowNodeTrajectoryStateFromPage,
  workflowNodeTrajectoryWithLoadedOutput,
  workflowNodeTrajectoryWithOlderPage,
  workflowNodeTrajectoryWithOutputError,
  workflowNodeTrajectoryWithOutputLoading,
} from "./workflow-node-agent-trajectory-adapter";
import {
  agentTaskDraftFromNode,
  latestWorkflowNodeExecution,
  requiredIncomingSummary,
  shortIdentifier,
  workflowConditionText,
  workflowGraphWithUpdatedAgentTask,
  workflowIncomingEdges,
  workflowNodeKindLabel,
  workflowOutgoingEdges,
  type AgentTaskDraft,
} from "./workflow-node-details-helpers";

type WorkflowDefinitionRecord = Awaited<ReturnType<typeof window.setta.workflow.readDefinition>>;
type WorkflowNodeDetailsTarget = NonNullable<
  ReturnType<typeof useWorkflowEditorStore.getState>["selectedNodeTarget"]
>;

const workflowRunEventLimit = 80;
const workflowNodeTrajectoryTranscriptLimit = 80;
const workflowNodeTrajectoryOutputLimit = 40;

export function WorkflowNodeDetailsSurface() {
  const target = useWorkflowEditorStore((state) => state.selectedNodeTarget);
  const activityFocus = useWorkflowEditorStore((state) => state.selectedNodeActivityFocus);
  const notifyWorkflowDefinitionChanged = useWorkflowEditorStore(
    (state) => state.notifyWorkflowDefinitionChanged,
  );
  const viewingRun = target?.executionId !== "";
  const { definition, loadError, setDefinition, setLoadError } = useWorkflowNodeDefinition(
    target,
    viewingRun,
  );
  const { actions: runInspectionActions, state: runInspection } = useWorkflowRunInspection(target);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [draft, setDraft] = useState<AgentTaskDraft | null>(null);
  const node = useMemo(() => {
    if (definition === null || target === null) {
      return null;
    }
    return definition.graph.nodes.find((candidate) => candidate.id === target.nodeId) ?? null;
  }, [definition, target]);

  useEffect(() => {
    setDraft(node === null ? null : agentTaskDraftFromNode(node));
  }, [node]);

  useEffect(() => {
    setSaveMessage("");
    if (target === null) {
      setDraft(null);
    }
  }, [target]);

  async function saveAgentTask() {
    const readOnly = target?.executionId !== "";
    if (target === null || definition === null || draft === null || readOnly) {
      return;
    }
    setSaving(true);
    setLoadError("");
    setSaveMessage("");
    try {
      const updatedGraph = workflowGraphWithUpdatedAgentTask(
        definition.graph,
        target.nodeId,
        draft,
      );
      const updated = await window.setta.workflow.updateDefinition(
        target.workspaceId,
        target.definitionId,
        definition.name,
        definition.description,
        updatedGraph,
      );
      setDefinition(updated);
      setSaveMessage("Saved");
      notifyWorkflowDefinitionChanged(target.workspaceId, target.definitionId);
      await useWorkflowDefinitionStore
        .getState()
        .refreshWorkspaceWorkflowDefinitions(target.workspaceId);
    } catch (error: unknown) {
      setLoadError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkflowDetailsShell title={workflowDetailsTitle(target, node)}>
      <WorkflowNodeDetailsContent
        activityFocus={activityFocus}
        definition={definition}
        draft={draft}
        loadError={loadError}
        node={node}
        onDraftChange={setDraft}
        onSave={() => void saveAgentTask()}
        runInspectionActions={runInspectionActions}
        runInspection={runInspection}
        saveMessage={saveMessage}
        saving={saving}
        target={target}
      />
    </WorkflowDetailsShell>
  );
}

function useWorkflowNodeDefinition(target: WorkflowNodeDetailsTarget | null, skip: boolean) {
  const [definition, setDefinition] = useState<WorkflowDefinitionRecord | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let disposed = false;
    setDefinition(null);
    setLoadError("");
    if (target === null || skip) {
      return;
    }
    void window.setta.workflow
      .readDefinition(target.workspaceId, target.definitionId)
      .then((loadedDefinition) => {
        if (!disposed) {
          setDefinition(loadedDefinition);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setLoadError(errorMessage(error));
        }
      });
    return () => {
      disposed = true;
    };
  }, [skip, target]);

  return { definition, loadError, setDefinition, setLoadError };
}

function useWorkflowRunInspection(target: WorkflowNodeDetailsTarget | null) {
  const [state, setState] = useState<WorkflowRunInspectionState>(() =>
    emptyWorkflowRunInspection(false),
  );

  const loadRunInspection = useCallback(async (target: WorkflowNodeDetailsTarget) => {
    const [execution, eventPage] = await Promise.all([
      window.setta.workflow.readExecution(target.workspaceId, target.executionId),
      window.setta.workflow.executionEvents(
        target.workspaceId,
        target.executionId,
        0,
        workflowRunEventLimit,
      ),
    ]);
    const nodeExecution = latestWorkflowNodeExecution(execution, target.nodeId);
    const { trajectory, trajectoryError } = await loadWorkflowNodeTrajectory(target, nodeExecution);
    return {
      events: eventPage.events,
      execution,
      loadError: "",
      loading: false,
      operation: null,
      trajectory,
      trajectoryError,
    } satisfies WorkflowRunInspectionState;
  }, []);

  useEffect(() => {
    let disposed = false;
    setState(emptyWorkflowRunInspection(target !== null && target.executionId !== ""));
    if (target === null || target.executionId === "") {
      return;
    }

    const runLoad = async () => {
      try {
        const nextState = await loadRunInspection(target);
        if (!disposed) {
          setState(nextState);
        }
      } catch (error: unknown) {
        if (!disposed) {
          setState({
            events: [],
            execution: null,
            loadError: errorMessage(error),
            loading: false,
            operation: null,
            trajectory: null,
            trajectoryError: "",
          });
        }
      }
    };

    void runLoad();
    return () => {
      disposed = true;
    };
  }, [loadRunInspection, target]);

  const reloadCurrentInspection = useCallback(async () => {
    if (target === null || target.executionId === "") {
      return;
    }
    const nextState = await loadRunInspection(target);
    setState(nextState);
  }, [loadRunInspection, target]);

  const loadOlder = useCallback(async () => {
    if (target === null || target.executionId === "") {
      return;
    }
    const current = state.trajectory;
    if (current === null || !current.page.hasMoreOlder) {
      return;
    }
    setState((previous) => ({ ...previous, operation: "loadingOlder" }));
    try {
      const page = await window.setta.workflow.readNodeTrajectory({
        beforeBlockOrdinal: current.page.olderBeforeBlockOrdinal,
        executionId: current.page.scope.executionId,
        nodeExecutionId: current.page.scope.nodeExecutionId,
        outputLimit: workflowNodeTrajectoryOutputLimit,
        transcriptLimit: workflowNodeTrajectoryTranscriptLimit,
        workspaceId: current.page.scope.workspaceId,
      });
      setState((previous) => ({
        ...previous,
        operation: null,
        trajectory:
          previous.trajectory === current
            ? workflowNodeTrajectoryWithOlderPage(current, page)
            : previous.trajectory,
      }));
    } catch (error: unknown) {
      setState((previous) => ({
        ...previous,
        operation: null,
        trajectoryError: errorMessage(error),
      }));
    }
  }, [state.trajectory, target]);

  const loadRunItemOutput = useCallback<WorkflowRunTrajectoryActions["loadRunItemOutput"]>(
    async (runId, runItemId, afterOrdinal = 0, limit = 200) => {
      if (target === null || target.executionId === "" || runId === "" || runItemId === "") {
        return;
      }
      setState((previous) => ({
        ...previous,
        trajectory:
          previous.trajectory === null
            ? null
            : workflowNodeTrajectoryWithOutputLoading(previous.trajectory, runItemId),
      }));
      try {
        const page = await window.setta.chat.runItemOutput(
          target.workspaceId,
          runId,
          runItemId,
          afterOrdinal,
          limit,
        );
        setState((previous) => ({
          ...previous,
          trajectory:
            previous.trajectory === null
              ? null
              : workflowNodeTrajectoryWithLoadedOutput(previous.trajectory, page, afterOrdinal),
        }));
      } catch (error: unknown) {
        setState((previous) => ({
          ...previous,
          trajectory:
            previous.trajectory === null
              ? null
              : workflowNodeTrajectoryWithOutputError(
                  previous.trajectory,
                  runItemId,
                  errorMessage(error),
                ),
        }));
      }
    },
    [target],
  );

  const submitApproval = useCallback<WorkflowRunTrajectoryActions["submitApproval"]>(
    async (approvalId, approved, response, answers, cancelled) => {
      const current = state.trajectory;
      if (current === null) {
        return;
      }
      setState((previous) => ({ ...previous, operation: "approving" }));
      try {
        await window.setta.workflow.submitApproval({
          answers,
          approvalId,
          approved,
          cancelled,
          executionId: current.page.scope.executionId,
          nodeExecutionId: current.page.scope.nodeExecutionId,
          response,
          workspaceId: current.page.scope.workspaceId,
        });
        await reloadCurrentInspection();
      } catch (error: unknown) {
        setState((previous) => ({
          ...previous,
          loadError: errorMessage(error),
          operation: null,
        }));
      }
    },
    [reloadCurrentInspection, state.trajectory],
  );

  return {
    actions: {
      loadOlder,
      loadRunItemOutput,
      submitApproval,
    },
    state,
  };
}

function emptyWorkflowRunInspection(loading: boolean): WorkflowRunInspectionState {
  return {
    events: [],
    execution: null,
    loadError: "",
    loading,
    operation: null,
    trajectory: null,
    trajectoryError: "",
  };
}

async function loadWorkflowNodeTrajectory(
  target: WorkflowNodeDetailsTarget,
  nodeExecution: ReturnType<typeof latestWorkflowNodeExecution>,
) {
  if (!workflowNodeExecutionHasAgentTrajectory(nodeExecution)) {
    return { trajectory: null, trajectoryError: "" };
  }
  try {
    const page = await window.setta.workflow.readNodeTrajectory({
      beforeBlockOrdinal: 0,
      executionId: target.executionId,
      nodeExecutionId: nodeExecution.id,
      outputLimit: workflowNodeTrajectoryOutputLimit,
      transcriptLimit: workflowNodeTrajectoryTranscriptLimit,
      workspaceId: target.workspaceId,
    });
    return { trajectory: workflowNodeTrajectoryStateFromPage(page), trajectoryError: "" };
  } catch (error: unknown) {
    return { trajectory: null, trajectoryError: errorMessage(error) };
  }
}

function workflowNodeExecutionHasAgentTrajectory(
  nodeExecution: ReturnType<typeof latestWorkflowNodeExecution>,
): nodeExecution is NonNullable<ReturnType<typeof latestWorkflowNodeExecution>> {
  return (
    nodeExecution !== null &&
    (nodeExecution.runnerKind === "agent.codex" || nodeExecution.actionKind === "agent.codex")
  );
}

function WorkflowNodeDetailsContent({
  activityFocus,
  definition,
  draft,
  loadError,
  node,
  onDraftChange,
  onSave,
  runInspectionActions,
  runInspection,
  saveMessage,
  saving,
  target,
}: {
  activityFocus: WorkflowNodeActivityFocus | null;
  definition: WorkflowDefinitionRecord | null;
  draft: AgentTaskDraft | null;
  loadError: string;
  node: WorkflowNode | null;
  onDraftChange: (draft: AgentTaskDraft) => void;
  onSave: () => void;
  runInspectionActions: WorkflowRunTrajectoryActions;
  runInspection: WorkflowRunInspectionState;
  saveMessage: string;
  saving: boolean;
  target: WorkflowNodeDetailsTarget | null;
}) {
  if (target === null) {
    return <WorkflowDetailsEmpty message="Select a workflow node to inspect or configure it." />;
  }
  if (target.executionId !== "") {
    return (
      <>
        <WorkflowNodeIdentity target={target} />
        <WorkflowRunDetailsContent
          actions={runInspectionActions}
          focus={activityFocus}
          inspection={runInspection}
          target={target}
        />
      </>
    );
  }
  if (loadError !== "") {
    return <WorkflowDetailsError message={loadError} />;
  }
  if (definition === null) {
    return <WorkflowDetailsEmpty message="Loading node details" />;
  }
  return (
    <>
      <WorkflowNodeIdentity target={target} />
      <WorkflowLoadedNodeDetails
        draft={draft}
        graph={definition.graph}
        node={node}
        onDraftChange={onDraftChange}
        onSave={onSave}
        saveMessage={saveMessage}
        saving={saving}
        target={target}
      />
    </>
  );
}

function WorkflowLoadedNodeDetails({
  draft,
  graph,
  node,
  onDraftChange,
  onSave,
  saveMessage,
  saving,
  target,
}: {
  draft: AgentTaskDraft | null;
  graph: WorkflowGraph;
  node: WorkflowNode | null;
  onDraftChange: (draft: AgentTaskDraft) => void;
  onSave: () => void;
  saveMessage: string;
  saving: boolean;
  target: WorkflowNodeDetailsTarget;
}) {
  if (node === null) {
    return <WorkflowDetailsEmpty message="The selected workflow node no longer exists." />;
  }
  if (draft === null) {
    return <WorkflowDraftNodeDetails graph={graph} node={node} />;
  }
  return (
    <AgentTaskDetailsForm
      draft={draft}
      onDraftChange={onDraftChange}
      onSave={onSave}
      readOnly={target.executionId !== ""}
      saveMessage={saveMessage}
      saving={saving}
    />
  );
}

function AgentTaskDetailsForm({
  draft,
  onDraftChange,
  onSave,
  readOnly,
  saveMessage,
  saving,
}: {
  draft: AgentTaskDraft;
  onDraftChange: (draft: AgentTaskDraft) => void;
  onSave: () => void;
  readOnly: boolean;
  saveMessage: string;
  saving: boolean;
}) {
  const disabled = saving || readOnly;
  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"
      data-testid="workflow-node-details-agent-task"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <AgentTaskReadOnlyNotice readOnly={readOnly} />
      <WorkflowTextField
        disabled={disabled}
        label="Title"
        onChange={(value) => onDraftChange({ ...draft, title: value })}
        value={draft.title}
      />
      <WorkflowTextArea
        disabled={disabled}
        label="Prompt"
        onChange={(value) => onDraftChange({ ...draft, prompt: value })}
        value={draft.prompt}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <WorkflowTextField
          disabled={disabled}
          label="Model"
          onChange={(value) => onDraftChange({ ...draft, model: value })}
          placeholder="default"
          value={draft.model}
        />
        <WorkflowTextField
          disabled={disabled}
          label="Reasoning"
          onChange={(value) => onDraftChange({ ...draft, reasoningEffort: value })}
          placeholder="default"
          value={draft.reasoningEffort}
        />
      </div>
      <AgentTaskFreshConversationField
        disabled={disabled}
        draft={draft}
        onDraftChange={onDraftChange}
      />
      <AgentTaskSaveRow disabled={disabled} saveMessage={saveMessage} saving={saving} />
    </form>
  );
}

function AgentTaskReadOnlyNotice({ readOnly }: { readOnly: boolean }) {
  if (!readOnly) {
    return null;
  }
  return (
    <div className="rounded-sm border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
      This pane is showing a run snapshot. Switch to the draft workflow before editing.
    </div>
  );
}

function AgentTaskFreshConversationField({
  disabled,
  draft,
  onDraftChange,
}: {
  disabled: boolean;
  draft: AgentTaskDraft;
  onDraftChange: (draft: AgentTaskDraft) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-zinc-300">
      <input
        checked={draft.freshConversation}
        className="h-4 w-4 accent-cyan-400"
        disabled={disabled}
        onChange={(event) =>
          onDraftChange({ ...draft, freshConversation: event.currentTarget.checked })
        }
        type="checkbox"
      />
      Fresh conversation
    </label>
  );
}

function AgentTaskSaveRow({
  disabled,
  saveMessage,
  saving,
}: {
  disabled: boolean;
  saveMessage: string;
  saving: boolean;
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
      <div className="min-w-0 text-xs text-zinc-400" data-testid="workflow-node-save-state">
        {saveMessage}
      </div>
      <button
        className="inline-flex h-8 items-center gap-2 rounded-sm bg-cyan-500 px-3 text-xs font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="workflow-node-save-button"
        disabled={disabled}
        type="submit"
      >
        <AgentTaskSaveIcon saving={saving} />
        Save
      </button>
    </div>
  );
}

function AgentTaskSaveIcon({ saving }: { saving: boolean }) {
  if (saving) {
    return <RefreshCcw className="h-3.5 w-3.5 animate-spin" />;
  }
  return <Save className="h-3.5 w-3.5" />;
}

function WorkflowDraftNodeDetails({ graph, node }: { graph: WorkflowGraph; node: WorkflowNode }) {
  switch (node.kind) {
    case "start":
    case "end":
      return <WorkflowControlDraftDetails graph={graph} node={node} />;
    case "gateway.xor":
      return <WorkflowRouteDraftDetails graph={graph} node={node} />;
    case "gateway.and":
    case "gateway.or":
      return <WorkflowJoinDraftDetails graph={graph} node={node} />;
    default:
      return <UnsupportedNodeDetails node={node} />;
  }
}

function WorkflowControlDraftDetails({
  graph,
  node,
}: {
  graph: WorkflowGraph;
  node: WorkflowNode;
}) {
  return (
    <WorkflowDraftDetailsShell testId="workflow-node-details-control">
      <WorkflowDetailsSection title="Definition">
        <WorkflowDetailsRows
          rows={[
            { label: "Kind", value: workflowNodeKindLabel(node.kind) },
            { label: "Incoming", value: `${workflowIncomingEdges(graph, node.id).length}` },
            { label: "Outgoing", value: `${workflowOutgoingEdges(graph, node.id).length}` },
          ]}
        />
      </WorkflowDetailsSection>
      <WorkflowEdgeList edges={workflowOutgoingEdges(graph, node.id)} title="Outgoing Edges" />
    </WorkflowDraftDetailsShell>
  );
}

function WorkflowRouteDraftDetails({ graph, node }: { graph: WorkflowGraph; node: WorkflowNode }) {
  return (
    <WorkflowDraftDetailsShell testId="workflow-node-details-route">
      <WorkflowDetailsSection title="Route">
        <WorkflowDetailsRows
          rows={[
            { label: "Incoming", value: `${workflowIncomingEdges(graph, node.id).length}` },
            { label: "Branches", value: `${workflowOutgoingEdges(graph, node.id).length}` },
          ]}
        />
      </WorkflowDetailsSection>
      <WorkflowEdgeList edges={workflowOutgoingEdges(graph, node.id)} title="Branches" />
    </WorkflowDraftDetailsShell>
  );
}

function WorkflowJoinDraftDetails({ graph, node }: { graph: WorkflowGraph; node: WorkflowNode }) {
  return (
    <WorkflowDraftDetailsShell testId="workflow-node-details-join">
      <WorkflowDetailsSection title={workflowNodeKindLabel(node.kind)}>
        <WorkflowDetailsRows
          rows={[
            { label: "Incoming", value: `${workflowIncomingEdges(graph, node.id).length}` },
            { label: "Required incoming", value: requiredIncomingSummary(node) },
            { label: "Outgoing", value: `${workflowOutgoingEdges(graph, node.id).length}` },
          ]}
        />
      </WorkflowDetailsSection>
      <WorkflowEdgeList edges={workflowIncomingEdges(graph, node.id)} title="Incoming Edges" />
      <WorkflowEdgeList edges={workflowOutgoingEdges(graph, node.id)} title="Outgoing Edges" />
    </WorkflowDraftDetailsShell>
  );
}

function WorkflowDraftDetailsShell({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4" data-testid={testId}>
      {children}
    </div>
  );
}

function WorkflowEdgeList({ edges, title }: { edges: WorkflowEdge[]; title: string }) {
  return (
    <WorkflowDetailsSection title={title}>
      {edges.length === 0 ? (
        <div className="text-xs text-zinc-500">No edges.</div>
      ) : (
        <div className="space-y-1">
          {edges.map((edge) => (
            <div
              className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-300"
              key={edge.id}
            >
              <div className="font-mono text-[11px] text-zinc-500">{edge.id}</div>
              <div className="mt-1">
                {edge.fromNodeId}
                {" -> "}
                {edge.toNodeId}
              </div>
              <div className="mt-1 text-zinc-400">{workflowConditionText(edge.condition)}</div>
            </div>
          ))}
        </div>
      )}
    </WorkflowDetailsSection>
  );
}

function WorkflowNodeIdentity({ target }: { target: WorkflowNodeDetailsTarget }) {
  return (
    <div className="border-b border-zinc-800 px-4 py-3 text-xs text-zinc-400">
      <div className="truncate">{target.definitionName}</div>
      <div
        className="mt-1 font-mono text-[11px] text-zinc-500"
        data-testid="workflow-node-details-node-id"
      >
        {target.nodeId}
      </div>
      {target.executionId !== "" ? (
        <div className="mt-1 font-mono text-[11px] text-zinc-500">
          run {shortIdentifier(target.executionId)} / {workflowVersionLabel(target)}
        </div>
      ) : null}
      {target.versionMismatch ? (
        <div className="mt-1 text-[11px] text-amber-300">
          Current draft differs from this version.
        </div>
      ) : null}
    </div>
  );
}

function workflowVersionLabel(target: WorkflowNodeDetailsTarget) {
  const version = target.definitionVersionNumber;
  const versionLabel = version > 0 ? `v${version}` : "version";
  return `${versionLabel} ${shortIdentifier(target.definitionVersionId)}`;
}

function workflowDetailsTitle(target: WorkflowNodeDetailsTarget | null, node: WorkflowNode | null) {
  if (target === null) {
    return "Workflow Node";
  }
  return node?.title || target.nodeLabel || target.nodeId || "Workflow Node";
}

function UnsupportedNodeDetails({ node }: { node: WorkflowNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Node kind</div>
      <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200">
        {node.kind}
      </div>
      <WorkflowDetailsEmpty message="Type-specific configuration for this node is not available yet." />
    </div>
  );
}

function WorkflowDetailsShell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100"
      data-testid="workflow-node-details-surface"
    >
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
        <div className="mt-1 text-xs text-zinc-500">Workflow node details</div>
      </header>
      {children}
    </section>
  );
}

function WorkflowTextField({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
      {label}
      <input
        className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function WorkflowTextArea({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-xs text-zinc-400">
      {label}
      <textarea
        className="min-h-40 flex-1 resize-none rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm leading-5 text-zinc-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
    </label>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workflow node operation failed";
}
