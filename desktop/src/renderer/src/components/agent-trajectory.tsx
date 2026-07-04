import type {
  ChatInput,
  ChatMessage,
  Run,
  RunItemOutput,
  RunLiveness,
  TranscriptBlock,
} from "@generated/backend";

import type { RunItemOutputPageState } from "../stores/chat-store";
import { ChatTranscript, type ChatTranscriptCapabilities } from "./chat-transcript";
import { activeRunPresentation, type ActiveRunControlCapabilities } from "../lib/chat-run-liveness";
import type { LoadRunItemOutput } from "./chat-transcript-activity";
import type { SubmitApproval } from "./chat-transcript-approvals";
import type { CurrentPlanSurfaceTarget } from "./chat-current-plan-surface";

interface ChatConversationAgentTrajectoryScope {
  kind: "chatConversation";
  conversationId: string;
  workspaceId: string;
}

interface WorkflowNodeExecutionAgentTrajectoryScope {
  kind: "workflowNodeExecution";
  attempt: number;
  conversationId: string;
  definitionId: string;
  definitionVersionId: string;
  executionId: string;
  iteration: number;
  nodeExecutionId: string;
  nodeId: string;
  runId: string;
  workspaceId: string;
}

type AgentTrajectoryScope =
  | ChatConversationAgentTrajectoryScope
  | WorkflowNodeExecutionAgentTrajectoryScope;

export interface AgentTrajectoryCapabilities extends ChatTranscriptCapabilities {
  retryLiveness: boolean;
  stopRun: boolean;
}

export interface AgentTrajectoryViewModel {
  scope: AgentTrajectoryScope;
  activeRun: Run | null;
  activeRunLiveness: RunLiveness | null;
  activeCurrentPlanTarget?: CurrentPlanSurfaceTarget | null;
  blocks: TranscriptBlock[];
  capabilities: AgentTrajectoryCapabilities;
  editingQueuedMessageId: string | null;
  focusedSourceRunItemId?: string | null;
  hasMoreOlder: boolean;
  messages: ChatMessage[];
  operation: string | null;
  queuedMessages: ChatMessage[];
  removingQueuedMessageId: string | null;
  runItemOutputIdsByRunItemId: Record<string, string[]>;
  runItemOutputPagesByRunItemId: Record<string, RunItemOutputPageState>;
  runItemOutputsById: Record<string, RunItemOutput>;
}

export interface AgentTrajectoryActions {
  editQueuedMessage?: (messageId: string, input: ChatInput) => Promise<void>;
  loadOlder?: () => Promise<void>;
  loadRunItemOutput?: LoadRunItemOutput;
  onOpenCurrentPlanSurface?: (target: CurrentPlanSurfaceTarget) => void;
  removeQueuedMessage?: (messageId: string) => Promise<void>;
  retryLiveness?: () => Promise<void>;
  sendSteering?: (input?: ChatInput) => Promise<void>;
  stopRun?: () => Promise<void>;
  submitApproval?: SubmitApproval;
}

export function AgentTrajectorySurface({
  actions,
  searchOpen = false,
  setSearchOpen,
  viewModel,
}: {
  actions: AgentTrajectoryActions;
  searchOpen?: boolean;
  setSearchOpen?: (open: boolean) => void;
  viewModel: AgentTrajectoryViewModel;
}) {
  const resolvedActions = resolveAgentTrajectoryActions(viewModel, actions);
  return (
    <div
      className="h-full min-h-0 min-w-0"
      data-agent-trajectory-conversation-id={agentTrajectoryScopeConversationId(viewModel.scope)}
      data-agent-trajectory-scope={viewModel.scope.kind}
      data-agent-trajectory-workspace-id={viewModel.scope.workspaceId}
      data-testid="agent-trajectory-surface"
    >
      <ChatTranscript
        activeCurrentPlanTarget={viewModel.activeCurrentPlanTarget}
        activeRun={viewModel.activeRun}
        activeRunLiveness={viewModel.activeRunLiveness}
        blocks={viewModel.blocks}
        capabilities={viewModel.capabilities}
        editQueuedMessage={resolvedActions.editQueuedMessage}
        editingQueuedMessageId={viewModel.editingQueuedMessageId}
        focusedSourceRunItemId={viewModel.focusedSourceRunItemId}
        hasMoreOlder={viewModel.hasMoreOlder}
        loadOlder={resolvedActions.loadOlder}
        loadRunItemOutput={resolvedActions.loadRunItemOutput}
        messages={viewModel.messages}
        operation={viewModel.operation}
        queuedMessages={viewModel.queuedMessages}
        removeQueuedMessage={resolvedActions.removeQueuedMessage}
        removingQueuedMessageId={viewModel.removingQueuedMessageId}
        runItemOutputIdsByRunItemId={viewModel.runItemOutputIdsByRunItemId}
        runItemOutputPagesByRunItemId={viewModel.runItemOutputPagesByRunItemId}
        runItemOutputsById={viewModel.runItemOutputsById}
        searchOpen={searchOpen}
        sendSteeringImmediately={resolvedActions.sendSteering}
        setSearchOpen={setSearchOpen}
        onOpenCurrentPlanSurface={actions.onOpenCurrentPlanSurface}
        submitApproval={resolvedActions.submitApproval}
      />
    </div>
  );
}

function agentTrajectoryScopeConversationId(scope: AgentTrajectoryScope) {
  switch (scope.kind) {
    case "chatConversation":
    case "workflowNodeExecution":
      return scope.conversationId;
    default:
      return assertNever(scope);
  }
}

function agentTrajectoryRunControlCapabilities(
  capabilities: AgentTrajectoryCapabilities,
): ActiveRunControlCapabilities {
  return {
    retryLiveness: capabilities.retryLiveness,
    sendSteering: capabilities.sendSteering,
    stopRun: capabilities.stopRun,
  };
}

export function activeRunPresentationForAgentTrajectory(viewModel: AgentTrajectoryViewModel) {
  return activeRunPresentation(
    viewModel.activeRun,
    viewModel.activeRunLiveness,
    agentTrajectoryRunControlCapabilities(viewModel.capabilities),
  );
}

function resolveAgentTrajectoryActions(
  viewModel: AgentTrajectoryViewModel,
  actions: AgentTrajectoryActions,
): AgentTrajectoryActions {
  const capabilities = viewModel.capabilities;
  const editQueuedMessage = requireAgentTrajectoryAction(
    capabilities.queuedMessageActions,
    actions.editQueuedMessage,
    "editQueuedMessage",
  );
  const removeQueuedMessage = requireAgentTrajectoryAction(
    capabilities.queuedMessageActions,
    actions.removeQueuedMessage,
    "removeQueuedMessage",
  );
  return {
    editQueuedMessage,
    loadOlder: requireAgentTrajectoryAction(
      capabilities.loadOlderHistory,
      actions.loadOlder,
      "loadOlder",
    ),
    loadRunItemOutput: requireAgentTrajectoryAction(
      capabilities.loadRunItemOutput,
      actions.loadRunItemOutput,
      "loadRunItemOutput",
    ),
    onOpenCurrentPlanSurface: actions.onOpenCurrentPlanSurface,
    removeQueuedMessage,
    retryLiveness: requireAgentTrajectoryAction(
      capabilities.retryLiveness,
      actions.retryLiveness,
      "retryLiveness",
    ),
    sendSteering: requireAgentTrajectoryAction(
      capabilities.sendSteering,
      actions.sendSteering,
      "sendSteering",
    ),
    stopRun: requireAgentTrajectoryAction(capabilities.stopRun, actions.stopRun, "stopRun"),
    submitApproval: requireAgentTrajectoryAction(
      capabilities.submitApproval,
      actions.submitApproval,
      "submitApproval",
    ),
  };
}

function requireAgentTrajectoryAction<T>(
  capabilityEnabled: boolean,
  action: T | undefined,
  actionName: string,
): T | undefined {
  if (capabilityEnabled && action === undefined) {
    throw new Error(`Agent trajectory action ${actionName} is required by its capability.`);
  }
  return capabilityEnabled ? action : undefined;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled agent trajectory scope: ${JSON.stringify(value)}`);
}
