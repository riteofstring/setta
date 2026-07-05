import type {
  ChatEvent,
  ChatInput,
  Run,
  RunLiveness,
  RunItemOutput,
  RunItemOutputPage,
  SteerMessageResult,
  TranscriptBlock,
  WorkflowAgentTrajectoryCapabilities,
  WorkflowAgentTrajectoryPage,
} from "@generated/backend";

import type {
  AgentTrajectoryActions,
  AgentTrajectoryCapabilities,
  AgentTrajectoryViewModel,
} from "../../components/agent-trajectory";
import type { ComposerActions, ComposerViewModel } from "../../components/chat-composer-contract";
import type { LoadRunItemOutput } from "../../components/chat-transcript-activity";
import type { SubmitApproval } from "../../components/chat-transcript-approvals";
import { activeRunPresentation, type ActiveRunPresentation } from "../../lib/chat-run-liveness";
import { runLivenessNeedsSnapshotResync } from "../../lib/chat-run-liveness";
import type { RunItemOutputPageState } from "../../stores/chat-store";
import {
  activeRunFromCandidate,
  activeRunLivenessFromCandidate,
  appendTranscriptBlockText,
  outputPageLoadedState,
  replaceRunTranscriptBlocks,
  updateRunItemOutputPageState,
  upsertRunItemOutputs,
  upsertTranscriptBlock,
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
    pendingSteeringMessages: [],
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
  retryLiveness,
  state,
  stopRun,
  submitApproval,
}: {
  loadOlder: () => Promise<void>;
  loadRunItemOutput: LoadRunItemOutput;
  retryLiveness: () => Promise<void>;
  state: WorkflowNodeTrajectoryState;
  stopRun: () => Promise<void>;
  submitApproval: SubmitApproval;
}): AgentTrajectoryActions {
  return {
    loadOlder: state.page.capabilities.canLoadOlderHistory ? loadOlder : undefined,
    loadRunItemOutput: state.page.capabilities.canLoadRunItemOutput ? loadRunItemOutput : undefined,
    retryLiveness: state.page.capabilities.canRetryLiveness ? retryLiveness : undefined,
    stopRun: state.page.capabilities.canStopRun ? stopRun : undefined,
    submitApproval: state.page.capabilities.canSubmitApproval ? submitApproval : undefined,
  };
}

export function workflowNodeComposerViewModel({
  operation,
  state,
}: {
  operation: string | null;
  state: WorkflowNodeTrajectoryState;
}): ComposerViewModel {
  return {
    activeRunId: state.page.activeRun?.id ?? "",
    commandListError: null,
    commandListStatus: "idle",
    goal: null,
    operation,
    pendingSteeringMessageIds: [],
    session: workflowNodeComposerSession(state),
    status: "ready",
  };
}

export function workflowNodeComposerActions({
  state,
  retryLiveness,
  steerMessage,
  stopRun,
}: {
  state: WorkflowNodeTrajectoryState;
  retryLiveness: () => Promise<void>;
  steerMessage: (input: ChatInput) => Promise<SteerMessageResult | null>;
  stopRun: () => Promise<void>;
}): ComposerActions {
  return {
    retryActiveRunLiveness: state.page.capabilities.canRetryLiveness ? retryLiveness : undefined,
    steerMessage: state.page.capabilities.canSteer ? steerMessage : undefined,
    stopActiveRun: state.page.capabilities.canStopRun ? stopRun : undefined,
  };
}

export function workflowNodeComposerRunPresentation(
  state: WorkflowNodeTrajectoryState,
): ActiveRunPresentation {
  return activeRunPresentation(
    activeRunForWorkflowNodeTrajectory(state.page),
    state.page.activeRunLiveness,
    {
      retryLiveness: state.page.capabilities.canRetryLiveness,
      sendSteering: state.page.capabilities.canSteer,
      stopRun: state.page.capabilities.canStopRun,
    },
  );
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

type WorkflowNodeTrajectoryChatEvent = Exclude<ChatEvent, { type: "chat.resync_required" }>;

export interface WorkflowNodeTrajectoryEventApplyResult {
  resync: boolean;
  state: WorkflowNodeTrajectoryState;
}

export function applyWorkflowNodeTrajectoryChatEvents(
  current: WorkflowNodeTrajectoryState,
  events: ChatEvent[],
): WorkflowNodeTrajectoryEventApplyResult {
  let state = current;
  let resync = false;
  for (const event of events) {
    const result = applyWorkflowNodeTrajectoryChatEvent(state, event);
    state = result.state;
    resync = resync || result.resync;
    if (result.resync) {
      break;
    }
  }
  return { resync, state };
}

function applyWorkflowNodeTrajectoryChatEvent(
  current: WorkflowNodeTrajectoryState,
  event: ChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  const cursor = workflowNodeTrajectoryChatCursorStatus(current.page, event);
  if (cursor === "duplicate") {
    return { resync: false, state: current };
  }
  if (cursor === "gap") {
    return { resync: true, state: current };
  }
  const stateWithCursor = workflowNodeTrajectoryWithChatCursor(current, event);
  if (event.type === "chat.resync_required") {
    return { resync: true, state: stateWithCursor };
  }
  if (!workflowNodeTrajectoryChatEventMatches(stateWithCursor.page, event)) {
    return { resync: false, state: stateWithCursor };
  }
  return applyWorkflowNodeTrajectoryScopedChatEvent(stateWithCursor, event);
}

type WorkflowNodeTrajectoryAnyChatEventHandler = (
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
) => WorkflowNodeTrajectoryEventApplyResult;

const workflowNodeTrajectoryChatEventHandlers = {
  "chat.assistant_text_delta": null,
  "chat.background_terminal.created": null,
  "chat.background_terminal.output_delta": null,
  "chat.background_terminal.updated": null,
  "chat.background_terminals.replaced": null,
  "chat.conversation.updated": null,
  "chat.goal.updated": null,
  "chat.message.created": null,
  "chat.message.queued": null,
  "chat.message.removed": null,
  "chat.message.steering_sent": null,
  "chat.message.updated": null,
  "chat.queue.updated": null,
  "chat.run.updated": workflowNodeTrajectoryWithRunEvent,
  "chat.run_item.created": null,
  "chat.run_item.updated": null,
  "chat.run_item_output.delta": workflowNodeTrajectoryWithOutputDeltaEvent,
  "chat.run_liveness.updated": workflowNodeTrajectoryWithRunLivenessEvent,
  "chat.transcript_block.created": workflowNodeTrajectoryWithTranscriptBlockEvent,
  "chat.transcript_block.updated": workflowNodeTrajectoryWithTranscriptBlockEvent,
  "chat.transcript_blocks.replaced": workflowNodeTrajectoryWithTranscriptBlocksReplacedEvent,
  "chat.transcript_text.delta": workflowNodeTrajectoryWithTranscriptTextDeltaEvent,
  "codex.account.changed": null,
  "diagnostic.created": null,
} satisfies Record<
  WorkflowNodeTrajectoryChatEvent["type"],
  WorkflowNodeTrajectoryAnyChatEventHandler | null
>;

function applyWorkflowNodeTrajectoryScopedChatEvent(
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  const handler = workflowNodeTrajectoryChatEventHandlers[event.type];
  if (handler === null) {
    return { resync: false, state: current };
  }
  return handler(current, event);
}

function workflowNodeTrajectoryWithTranscriptBlockEvent(
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  if (
    event.type !== "chat.transcript_block.created" &&
    event.type !== "chat.transcript_block.updated"
  ) {
    return unexpectedWorkflowNodeTrajectoryChatEvent(event);
  }
  return workflowNodeTrajectoryWithBlocks(
    current,
    upsertTranscriptBlock(current.page.blocks, event.payload.block),
  );
}

function workflowNodeTrajectoryWithTranscriptTextDeltaEvent(
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  if (event.type !== "chat.transcript_text.delta") {
    return unexpectedWorkflowNodeTrajectoryChatEvent(event);
  }
  return workflowNodeTrajectoryWithTextDelta(current, event);
}

function workflowNodeTrajectoryWithTranscriptBlocksReplacedEvent(
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  if (event.type !== "chat.transcript_blocks.replaced") {
    return unexpectedWorkflowNodeTrajectoryChatEvent(event);
  }
  return workflowNodeTrajectoryWithBlocks(
    current,
    replaceRunTranscriptBlocks(current.page.blocks, event.payload.runId, event.payload.blocks),
  );
}

function workflowNodeTrajectoryWithRunEvent(
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  if (event.type !== "chat.run.updated") {
    return unexpectedWorkflowNodeTrajectoryChatEvent(event);
  }
  return workflowNodeTrajectoryWithRun(current, event.payload.run);
}

function workflowNodeTrajectoryWithRunLivenessEvent(
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  if (event.type !== "chat.run_liveness.updated") {
    return unexpectedWorkflowNodeTrajectoryChatEvent(event);
  }
  return workflowNodeTrajectoryWithRunLiveness(current, event.payload.liveness);
}

function workflowNodeTrajectoryWithOutputDeltaEvent(
  current: WorkflowNodeTrajectoryState,
  event: WorkflowNodeTrajectoryChatEvent,
): WorkflowNodeTrajectoryEventApplyResult {
  if (event.type !== "chat.run_item_output.delta") {
    return unexpectedWorkflowNodeTrajectoryChatEvent(event);
  }
  return workflowNodeTrajectoryWithOutputDelta(current, event.payload.output);
}

function unexpectedWorkflowNodeTrajectoryChatEvent(event: WorkflowNodeTrajectoryChatEvent): never {
  throw new Error(`Unexpected workflow node trajectory event handler: ${event.type}`);
}

function workflowNodeTrajectoryChatEventMatches(
  page: WorkflowAgentTrajectoryPage,
  event: WorkflowNodeTrajectoryChatEvent,
) {
  return (
    event.workspaceId === page.scope.workspaceId &&
    event.conversationId === page.conversationId &&
    event.runId === page.runId
  );
}

function workflowNodeTrajectoryChatCursorStatus(
  page: WorkflowAgentTrajectoryPage,
  event: ChatEvent,
): "current" | "duplicate" | "gap" {
  if (page.lastChatEventStreamId !== "" && event.streamId !== page.lastChatEventStreamId) {
    return "gap";
  }
  if (
    event.streamId === page.lastChatEventStreamId &&
    event.sequence <= page.lastChatEventSequence
  ) {
    return "duplicate";
  }
  if (
    event.streamId === page.lastChatEventStreamId &&
    page.lastChatEventSequence > 0 &&
    event.sequence !== page.lastChatEventSequence + 1
  ) {
    return "gap";
  }
  return "current";
}

function workflowNodeTrajectoryWithChatCursor(
  current: WorkflowNodeTrajectoryState,
  event: ChatEvent,
): WorkflowNodeTrajectoryState {
  return {
    ...current,
    page: {
      ...current.page,
      lastChatEventSequence: event.sequence,
      lastChatEventStreamId: event.streamId,
    },
  };
}

function workflowNodeTrajectoryWithBlocks(
  current: WorkflowNodeTrajectoryState,
  blocks: TranscriptBlock[],
): WorkflowNodeTrajectoryEventApplyResult {
  return {
    resync: false,
    state: {
      ...current,
      page: { ...current.page, blocks },
    },
  };
}

function workflowNodeTrajectoryWithTextDelta(
  current: WorkflowNodeTrajectoryState,
  event: Extract<WorkflowNodeTrajectoryChatEvent, { type: "chat.transcript_text.delta" }>,
): WorkflowNodeTrajectoryEventApplyResult {
  const updated = appendTranscriptBlockText(
    current.page.blocks,
    event.payload.blockId,
    event.payload.delta,
    event.payload.updatedAt,
  );
  if (!updated.found) {
    return { resync: true, state: current };
  }
  return workflowNodeTrajectoryWithBlocks(current, updated.blocks);
}

function workflowNodeTrajectoryWithRun(
  current: WorkflowNodeTrajectoryState,
  run: Run,
): WorkflowNodeTrajectoryEventApplyResult {
  const activeRun = activeRunFromCandidate(run);
  const activeRunLiveness = activeRunLivenessFromCandidate(
    activeRun,
    current.page.activeRunLiveness,
  );
  return {
    resync: false,
    state: {
      ...current,
      page: workflowNodeTrajectoryPageWithActiveRun(
        current.page,
        run,
        activeRun,
        activeRunLiveness,
      ),
    },
  };
}

function workflowNodeTrajectoryWithRunLiveness(
  current: WorkflowNodeTrajectoryState,
  liveness: RunLiveness,
): WorkflowNodeTrajectoryEventApplyResult {
  const activeRun = activeRunFromCandidate(current.page.run);
  const activeRunLiveness = activeRunLivenessFromCandidate(activeRun, liveness);
  return {
    resync: runLivenessNeedsSnapshotResync(liveness),
    state: {
      ...current,
      page: workflowNodeTrajectoryPageWithActiveRun(
        current.page,
        current.page.run,
        activeRun,
        activeRunLiveness,
      ),
    },
  };
}

function workflowNodeTrajectoryWithOutputDelta(
  current: WorkflowNodeTrajectoryState,
  output: RunItemOutput,
): WorkflowNodeTrajectoryEventApplyResult {
  const outputs = upsertRunItemOutputs(current.outputs, [output]);
  const outputIndex = workflowNodeTrajectoryOutputIndex(outputs);
  const currentPage = current.outputPagesByRunItemId[output.runItemId];
  const loadedThroughOrdinal = Math.max(currentPage?.loadedThroughOrdinal ?? 0, output.ordinal);
  return {
    resync: false,
    state: {
      ...current,
      outputIdsByRunItemId: outputIndex.outputIdsByRunItemId,
      outputPagesByRunItemId: updateRunItemOutputPageState(
        current.outputPagesByRunItemId,
        output.runItemId,
        {
          loadedThroughOrdinal,
          nextOrdinal: Math.max(currentPage?.nextOrdinal ?? 0, loadedThroughOrdinal + 1),
        },
      ),
      outputs,
      outputsById: outputIndex.outputsById,
    },
  };
}

function workflowNodeTrajectoryPageWithActiveRun(
  page: WorkflowAgentTrajectoryPage,
  run: Run,
  activeRun: Run | null,
  activeRunLiveness: RunLiveness | null,
): WorkflowAgentTrajectoryPage {
  return {
    ...page,
    activeRun,
    activeRunLiveness,
    capabilities: {
      ...page.capabilities,
      canRetryLiveness: workflowNodeTrajectoryCanRetryLiveness(activeRun, activeRunLiveness),
      canSteer: workflowNodeTrajectoryCanSteer(activeRun, activeRunLiveness),
      canStopRun: workflowNodeTrajectoryCanStopRun(activeRunLiveness),
    },
    run,
  };
}

function workflowNodeTrajectoryCanRetryLiveness(
  activeRun: Run | null,
  activeRunLiveness: RunLiveness | null,
) {
  return activeRun?.status === "running" && activeRunLiveness?.retryable === true;
}

function workflowNodeTrajectoryCanStopRun(activeRunLiveness: RunLiveness | null) {
  return activeRunLiveness?.cancellable === true;
}

function workflowNodeTrajectoryCanSteer(
  activeRun: Run | null,
  activeRunLiveness: RunLiveness | null,
) {
  return (
    activeRun?.status === "running" &&
    activeRun.pendingApproval === null &&
    activeRunLiveness?.status === "attached"
  );
}

function workflowNodeTrajectoryCapabilities(
  capabilities: WorkflowAgentTrajectoryCapabilities,
): AgentTrajectoryCapabilities {
  return {
    loadOlderHistory: capabilities.canLoadOlderHistory,
    loadRunItemOutput: capabilities.canLoadRunItemOutput,
    queuedMessageActions: false,
    retryLiveness: capabilities.canRetryLiveness,
    sendSteering: false,
    stopRun: capabilities.canStopRun,
    submitApproval: capabilities.canSubmitApproval,
  };
}

function assertSupportedWorkflowNodeTrajectoryCapabilities(
  capabilities: WorkflowAgentTrajectoryCapabilities,
) {
  void capabilities;
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

function workflowNodeComposerSession(
  state: WorkflowNodeTrajectoryState,
): ComposerViewModel["session"] {
  if (state.page.activeRun?.status !== "running") {
    return null;
  }
  const settings = state.page.runSettings;
  return {
    commandListContextKey: "",
    id: `workflow-node:${state.page.scope.nodeExecutionId}`,
    modelLabel: settings?.modelDisplayName ?? "",
    permissionLabel: settings?.permissionDisplayLabel ?? "",
    reasoningLabel: settings?.reasoningEffortDisplayName ?? "",
    supportsImages: false,
    workspaceId: state.page.scope.workspaceId,
  };
}
