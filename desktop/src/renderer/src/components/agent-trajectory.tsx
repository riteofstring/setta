import type {
  ChatInput,
  ChatMessage,
  Run,
  RunItemOutput,
  RunLiveness,
  TranscriptBlock,
} from "@generated/backend";

import type { RunItemOutputPageState } from "../stores/chat-store";
import { ChatTranscript } from "./chat-transcript";
import type { LoadRunItemOutput } from "./chat-transcript-activity";
import type { SubmitApproval } from "./chat-transcript-approvals";
import type { CurrentPlanSurfaceTarget } from "./chat-current-plan-surface";

interface ChatConversationAgentTrajectoryScope {
  kind: "chatConversation";
  conversationId: string;
  workspaceId: string;
}

type AgentTrajectoryScope = ChatConversationAgentTrajectoryScope;

export interface AgentTrajectoryCapabilities {
  loadOlderHistory: boolean;
  loadRunItemOutput: boolean;
  queuedMessageActions: boolean;
  sendSteering: boolean;
  submitApproval: boolean;
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
  editQueuedMessage: (messageId: string, input: ChatInput) => Promise<void>;
  loadOlder: () => Promise<void>;
  loadRunItemOutput: LoadRunItemOutput;
  onOpenCurrentPlanSurface?: (target: CurrentPlanSurfaceTarget) => void;
  removeQueuedMessage: (messageId: string) => Promise<void>;
  sendSteering: (input?: ChatInput) => Promise<void>;
  submitApproval: SubmitApproval;
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
  return (
    <div
      className="h-full min-h-0 min-w-0"
      data-agent-trajectory-conversation-id={viewModel.scope.conversationId}
      data-agent-trajectory-scope={viewModel.scope.kind}
      data-agent-trajectory-workspace-id={viewModel.scope.workspaceId}
      data-testid="agent-trajectory-surface"
    >
      <ChatTranscript
        activeCurrentPlanTarget={viewModel.activeCurrentPlanTarget}
        activeRun={viewModel.activeRun}
        activeRunLiveness={viewModel.activeRunLiveness}
        blocks={viewModel.blocks}
        editQueuedMessage={actions.editQueuedMessage}
        editingQueuedMessageId={viewModel.editingQueuedMessageId}
        focusedSourceRunItemId={viewModel.focusedSourceRunItemId}
        hasMoreOlder={viewModel.hasMoreOlder}
        loadOlder={actions.loadOlder}
        loadRunItemOutput={actions.loadRunItemOutput}
        messages={viewModel.messages}
        operation={viewModel.operation}
        queuedMessages={viewModel.queuedMessages}
        removeQueuedMessage={actions.removeQueuedMessage}
        removingQueuedMessageId={viewModel.removingQueuedMessageId}
        runItemOutputIdsByRunItemId={viewModel.runItemOutputIdsByRunItemId}
        runItemOutputPagesByRunItemId={viewModel.runItemOutputPagesByRunItemId}
        runItemOutputsById={viewModel.runItemOutputsById}
        searchOpen={searchOpen}
        sendSteeringImmediately={actions.sendSteering}
        setSearchOpen={setSearchOpen}
        onOpenCurrentPlanSurface={actions.onOpenCurrentPlanSurface}
        submitApproval={actions.submitApproval}
      />
    </div>
  );
}
