import type {
  Run,
  RunItemOutput,
  RunItemOutputPage,
  WorkflowAgentTrajectoryCapabilities,
  WorkflowAgentTrajectoryPage,
} from "@generated/backend";

import type {
  AgentTrajectoryActions,
  AgentTrajectoryCapabilities,
  AgentTrajectoryViewModel,
} from "../../components/agent-trajectory";
import type { LoadRunItemOutput } from "../../components/chat-transcript-activity";
import type { SubmitApproval } from "../../components/chat-transcript-approvals";
import type { RunItemOutputPageState } from "../../stores/chat-store";
import {
  outputPageLoadedState,
  updateRunItemOutputPageState,
  upsertRunItemOutputs,
} from "../../stores/chat-store-normalization";

export interface WorkflowNodeTrajectoryState {
  outputIdsByRunItemId: Record<string, string[]>;
  outputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  outputs: RunItemOutput[];
  outputsById: Record<string, RunItemOutput>;
  page: WorkflowAgentTrajectoryPage;
}

export function workflowNodeTrajectoryStateFromPage(
  page: WorkflowAgentTrajectoryPage,
): WorkflowNodeTrajectoryState {
  const outputs = upsertRunItemOutputs([], page.outputs);
  return {
    ...workflowNodeTrajectoryOutputState(page, outputs),
    outputs,
    page,
  };
}

export function workflowNodeTrajectoryViewModel({
  focusedSourceRunItemId,
  operation,
  state,
}: {
  focusedSourceRunItemId: string | null;
  operation: string | null;
  state: WorkflowNodeTrajectoryState;
}): AgentTrajectoryViewModel {
  assertSupportedWorkflowNodeTrajectoryCapabilities(state.page.capabilities);
  return {
    activeRun: activeRunForWorkflowNodeTrajectory(state.page),
    activeRunLiveness: state.page.activeRunLiveness,
    blocks: state.page.blocks,
    capabilities: workflowNodeTrajectoryCapabilities(state.page.capabilities),
    editingQueuedMessageId: null,
    focusedSourceRunItemId,
    hasMoreOlder: state.page.hasMoreOlder,
    messages: [],
    operation,
    queuedMessages: [],
    removingQueuedMessageId: null,
    runItemOutputIdsByRunItemId: state.outputIdsByRunItemId,
    runItemOutputPagesByRunItemId: state.outputPagesByRunItemId,
    runItemOutputsById: state.outputsById,
    scope: {
      attempt: state.page.scope.attempt,
      conversationId: state.page.conversationId,
      definitionId: state.page.scope.definitionId,
      definitionVersionId: state.page.scope.definitionVersionId,
      executionId: state.page.scope.executionId,
      iteration: state.page.scope.iteration,
      kind: "workflowNodeExecution",
      nodeExecutionId: state.page.scope.nodeExecutionId,
      nodeId: state.page.scope.nodeId,
      runId: state.page.runId,
      workspaceId: state.page.scope.workspaceId,
    },
  };
}

export function workflowNodeTrajectoryActions({
  loadOlder,
  loadRunItemOutput,
  state,
  submitApproval,
}: {
  loadOlder: () => Promise<void>;
  loadRunItemOutput: LoadRunItemOutput;
  state: WorkflowNodeTrajectoryState;
  submitApproval: SubmitApproval;
}): AgentTrajectoryActions {
  return {
    loadOlder: state.page.capabilities.canLoadOlderHistory ? loadOlder : undefined,
    loadRunItemOutput: state.page.capabilities.canLoadRunItemOutput ? loadRunItemOutput : undefined,
    submitApproval: state.page.capabilities.canSubmitApproval ? submitApproval : undefined,
  };
}

export function workflowNodeTrajectoryWithOlderPage(
  current: WorkflowNodeTrajectoryState,
  olderPage: WorkflowAgentTrajectoryPage,
): WorkflowNodeTrajectoryState {
  const currentBlockIds = new Set(current.page.blocks.map((block) => block.id));
  const olderBlocks = olderPage.blocks.filter((block) => !currentBlockIds.has(block.id));
  const olderOutputState = workflowNodeTrajectoryStateFromPage(olderPage);
  const outputs = upsertRunItemOutputs(current.outputs, olderPage.outputs);
  return {
    ...current,
    outputIdsByRunItemId: {
      ...olderOutputState.outputIdsByRunItemId,
      ...current.outputIdsByRunItemId,
    },
    outputPagesByRunItemId: {
      ...olderOutputState.outputPagesByRunItemId,
      ...current.outputPagesByRunItemId,
    },
    outputs,
    outputsById: workflowNodeTrajectoryOutputIndex(outputs).outputsById,
    page: {
      ...olderPage,
      blocks: [...olderBlocks, ...current.page.blocks],
    },
  };
}

export function workflowNodeTrajectoryWithOutputLoading(
  current: WorkflowNodeTrajectoryState,
  runItemId: string,
): WorkflowNodeTrajectoryState {
  return {
    ...current,
    outputPagesByRunItemId: updateRunItemOutputPageState(
      current.outputPagesByRunItemId,
      runItemId,
      {
        error: null,
        loading: true,
      },
    ),
  };
}

export function workflowNodeTrajectoryWithLoadedOutput(
  current: WorkflowNodeTrajectoryState,
  page: RunItemOutputPage,
  afterOrdinal: number,
): WorkflowNodeTrajectoryState {
  const outputs = upsertRunItemOutputs(current.outputs, page.output);
  const outputIndex = workflowNodeTrajectoryOutputIndex(outputs);
  return {
    ...current,
    outputIdsByRunItemId: outputIndex.outputIdsByRunItemId,
    outputPagesByRunItemId: updateRunItemOutputPageState(
      current.outputPagesByRunItemId,
      page.runItemId,
      outputPageLoadedState(page.output, afterOrdinal, page.hasMore, page.nextOrdinal),
    ),
    outputs,
    outputsById: outputIndex.outputsById,
  };
}

export function workflowNodeTrajectoryWithOutputError(
  current: WorkflowNodeTrajectoryState,
  runItemId: string,
  error: string,
): WorkflowNodeTrajectoryState {
  return {
    ...current,
    outputPagesByRunItemId: updateRunItemOutputPageState(
      current.outputPagesByRunItemId,
      runItemId,
      {
        error,
        loading: false,
      },
    ),
  };
}

function workflowNodeTrajectoryCapabilities(
  capabilities: WorkflowAgentTrajectoryCapabilities,
): AgentTrajectoryCapabilities {
  return {
    loadOlderHistory: capabilities.canLoadOlderHistory,
    loadRunItemOutput: capabilities.canLoadRunItemOutput,
    queuedMessageActions: false,
    retryLiveness: false,
    sendSteering: false,
    stopRun: false,
    submitApproval: capabilities.canSubmitApproval,
  };
}

function assertSupportedWorkflowNodeTrajectoryCapabilities(
  capabilities: WorkflowAgentTrajectoryCapabilities,
) {
  if (capabilities.canRetryLiveness) {
    throw new Error("Workflow node trajectory retry liveness requires a node-scoped action.");
  }
  if (capabilities.canSteer) {
    throw new Error("Workflow node trajectory steering requires a node-scoped action.");
  }
  if (capabilities.canStopRun) {
    throw new Error("Workflow node trajectory stop requires a node-scoped action.");
  }
}

function activeRunForWorkflowNodeTrajectory(page: WorkflowAgentTrajectoryPage): Run | null {
  if (page.activeRun !== null) {
    return page.activeRun;
  }
  if (page.pendingApproval === null) {
    return null;
  }
  if (page.run.pendingApproval !== null) {
    return page.run;
  }
  return {
    ...page.run,
    pendingApproval: page.pendingApproval.approval,
  };
}

function workflowNodeTrajectoryOutputState(
  page: WorkflowAgentTrajectoryPage,
  outputs: RunItemOutput[],
) {
  const outputIndex = workflowNodeTrajectoryOutputIndex(outputs);
  const outputPagesByRunItemId: Record<string, RunItemOutputPageState> = {};
  const outputIdsByRunItemId = { ...outputIndex.outputIdsByRunItemId };
  for (const outputPage of page.outputPages) {
    outputIdsByRunItemId[outputPage.runItemId] = outputPage.outputIds;
    outputPagesByRunItemId[outputPage.runItemId] = {
      error: null,
      hasMore: outputPage.hasMore,
      loadedThroughOrdinal: outputPage.loadedThroughOrdinal,
      loading: false,
      nextOrdinal: outputPage.nextOrdinal,
    };
  }
  return {
    outputIdsByRunItemId,
    outputPagesByRunItemId,
    outputsById: outputIndex.outputsById,
  };
}

function workflowNodeTrajectoryOutputIndex(outputs: RunItemOutput[]) {
  const outputsById: Record<string, RunItemOutput> = {};
  const outputIdsByRunItemId: Record<string, string[]> = {};
  for (const output of outputs) {
    outputsById[output.id] = output;
    outputIdsByRunItemId[output.runItemId] = [
      ...(outputIdsByRunItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return { outputIdsByRunItemId, outputsById };
}
